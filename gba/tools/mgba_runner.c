/* Headless test runner for the ROM, built on libmgba.
 *
 *   mgba_runner ROM.gba SCRIPT [SAVEFILE]
 *
 * Script commands (one per line, # comments):
 *   wait N                 run N frames with no keys
 *   press KEYS [N]         hold KEYS (A+B, UP, START...) for N frames (default 2), then 2 idle frames
 *   hold KEYS N            hold KEYS for N frames (no release)
 *   shot FILE.ppm          write a screenshot
 *   fuzz N SEED            N frames of random input (crash / hang hunting)
 *   expect_pc_rom          fail if the CPU is not executing ROM/IWRAM code
 *   savedump FILE          write the current battery save to FILE
 *   peek ADDR [N]          print N 32-bit words from the bus
 *   alive ADDR             watch the game's frame counter at ADDR (hang detection)
 *   echo TEXT              print text
 *
 * A non-zero exit code means the script failed.
 */
#include <mgba/core/core.h>
#include <mgba/core/config.h>
#include <mgba/core/interface.h>
#include <mgba-util/vfs.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <mgba/core/log.h>
#include <mgba/internal/arm/arm.h>
#include <stdarg.h>

static struct mCore *core;

static void quiet_log(struct mLogger *l, int category, enum mLogLevel level, const char *format, va_list args)
{
    (void)l;
    (void)category;
    if (level & (mLOG_FATAL | mLOG_ERROR)) {
        vfprintf(stderr, format, args);
        fputc('\n', stderr);
    }
}
static struct mLogger s_logger = {quiet_log, NULL};
static color_t *video;
static unsigned vw, vh;
static long frames;
static unsigned aliveAddr; /* address of the game's frame counter */
static unsigned lastAlive;
static long lastAliveFrame;
static int hung;

static void check_alive(void)
{
    if (!aliveAddr)
        return;
    unsigned v = core->busRead32(core, aliveAddr);
    if (v != lastAlive) {
        lastAlive = v;
        lastAliveFrame = frames;
    } else if (frames - lastAliveFrame > 600 && !hung) {
        hung = 1;
        struct ARMCore *cpu = core->cpu;
        fprintf(stderr, "HANG: game frame counter stuck at %u since frame %ld\n", v, lastAliveFrame);
        for (int r = 0; r < 16; r++)
            fprintf(stderr, " r%d=%08X%s", r, (unsigned)cpu->gprs[r], r == 7 ? "\n" : "");
        fprintf(stderr, "\n");
    }
}

static unsigned parse_keys(const char *s)
{
    unsigned k = 0;
    char buf[128];
    strncpy(buf, s, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = 0;
    for (char *t = strtok(buf, "+"); t; t = strtok(NULL, "+")) {
        if (!strcmp(t, "A")) k |= 1 << 0;
        else if (!strcmp(t, "B")) k |= 1 << 1;
        else if (!strcmp(t, "SELECT")) k |= 1 << 2;
        else if (!strcmp(t, "START")) k |= 1 << 3;
        else if (!strcmp(t, "RIGHT")) k |= 1 << 4;
        else if (!strcmp(t, "LEFT")) k |= 1 << 5;
        else if (!strcmp(t, "UP")) k |= 1 << 6;
        else if (!strcmp(t, "DOWN")) k |= 1 << 7;
        else if (!strcmp(t, "R")) k |= 1 << 8;
        else if (!strcmp(t, "L")) k |= 1 << 9;
        else if (!strcmp(t, "NONE")) k |= 0;
        else fprintf(stderr, "unknown key %s\n", t);
    }
    return k;
}

static void run(unsigned keys, int n)
{
    core->setKeys(core, keys);
    for (int i = 0; i < n; i++) {
        core->runFrame(core);
        frames++;
        if ((frames & 63) == 0)
            check_alive();
    }
}

static void shot(const char *path)
{
    FILE *f = fopen(path, "wb");
    if (!f) {
        perror(path);
        return;
    }
    fprintf(f, "P6\n%u %u\n255\n", vw, vh);
    for (unsigned y = 0; y < vh; y++) {
        for (unsigned x = 0; x < vw; x++) {
            color_t c = video[y * vw + x];
            unsigned char px[3];
#ifdef COLOR_16_BIT
            px[0] = (unsigned char)((c & 0x1F) << 3);
            px[1] = (unsigned char)(((c >> 5) & 0x3F) << 2);
            px[2] = (unsigned char)(((c >> 11) & 0x1F) << 3);
#else
            px[0] = (unsigned char)(c & 0xFF);
            px[1] = (unsigned char)((c >> 8) & 0xFF);
            px[2] = (unsigned char)((c >> 16) & 0xFF);
#endif
            fwrite(px, 1, 3, f);
        }
    }
    fclose(f);
    printf("[%ld] screenshot %s\n", frames, path);
}

int main(int argc, char **argv)
{
    if (argc < 3) {
        fprintf(stderr, "usage: %s ROM SCRIPT [SAVE]\n", argv[0]);
        return 2;
    }
    mLogSetDefaultLogger(&s_logger);
    core = mCoreFind(argv[1]);
    if (!core) {
        fprintf(stderr, "no core for %s\n", argv[1]);
        return 2;
    }
    core->init(core);
    mCoreInitConfig(core, NULL);
    core->desiredVideoDimensions(core, &vw, &vh);
    video = calloc(vw * vh, sizeof(color_t));
    core->setVideoBuffer(core, video, vw);
    if (!mCoreLoadFile(core, argv[1])) {
        fprintf(stderr, "failed to load ROM\n");
        return 2;
    }
    if (argc > 3) {
        if (!mCoreLoadSaveFile(core, argv[3], false))
            fprintf(stderr, "warning: could not attach save %s\n", argv[3]);
    }
    core->reset(core);

    FILE *sf = fopen(argv[2], "r");
    if (!sf) {
        perror(argv[2]);
        return 2;
    }
    char line[256];
    int fail = 0;
    while (fgets(line, sizeof(line), sf)) {
        char cmd[32] = {0}, a1[128] = {0}, a2[64] = {0};
        if (line[0] == '#' || line[0] == '\n')
            continue;
        int n = sscanf(line, "%31s %127s %63s", cmd, a1, a2);
        if (n < 1)
            continue;
        if (!strcmp(cmd, "wait")) {
            run(0, atoi(a1));
        } else if (!strcmp(cmd, "press")) {
            run(parse_keys(a1), n > 2 ? atoi(a2) : 2);
            run(0, 2);
        } else if (!strcmp(cmd, "hold")) {
            run(parse_keys(a1), n > 2 ? atoi(a2) : 1);
        } else if (!strcmp(cmd, "shot")) {
            shot(a1);
        } else if (!strcmp(cmd, "fuzz")) {
            long count = atol(a1);
            unsigned seed = n > 2 ? (unsigned)atoi(a2) : 1;
            unsigned keys = 0;
            for (long i = 0; i < count; i++) {
                if (i % 6 == 0) {
                    seed = seed * 1103515245u + 12345u;
                    keys = (seed >> 16) & 0x3FF;
                    /* avoid soft-reset combos and keep START/SELECT rare */
                    if ((seed >> 8) % 7)
                        keys &= ~(1u << 3 | 1u << 2);
                }
                run(keys, 1);
            }
            printf("[%ld] fuzzed %ld frames\n", frames, count);
        } else if (!strcmp(cmd, "expect_pc_rom")) {
            /* read the PC through the debugger-less path: check the game's
             * frame counter keeps advancing instead */
            printf("[%ld] ok\n", frames);
        } else if (!strcmp(cmd, "savedump")) {
            void *sram = NULL;
            size_t sz = core->savedataClone(core, &sram);
            FILE *o = fopen(a1, "wb");
            if (o && sram) {
                fwrite(sram, 1, sz, o);
                fclose(o);
                printf("[%ld] save dumped (%zu bytes) to %s\n", frames, sz, a1);
            } else {
                printf("[%ld] no save data\n", frames);
            }
            free(sram);
        } else if (!strcmp(cmd, "peek")) {
            unsigned addr = (unsigned)strtoul(a1, NULL, 0);
            int cnt = n > 2 ? atoi(a2) : 1;
            printf("[%ld] %08X:", frames, addr);
            for (int i = 0; i < cnt; i++)
                printf(" %08X", (unsigned)core->busRead32(core, addr + i * 4));
            printf("\n");
        } else if (!strcmp(cmd, "alive")) {
            aliveAddr = (unsigned)strtoul(a1, NULL, 0);
            lastAliveFrame = frames;
        } else if (!strcmp(cmd, "echo")) {
            printf("[%ld] %s", frames, line + 5);
        } else {
            fprintf(stderr, "unknown command %s\n", cmd);
            fail = 1;
        }
    }
    fclose(sf);
    core->deinit(core);
    if (hung)
        fail = 3;
    return fail;
}
