/* Host-side test of the on-field play engine: runs thousands of snaps with
 * the autopilot and checks that every play ends and stats are sane. */
#include <stdio.h>
#include <string.h>
#include "../src/play.h"
#include "../src/rng.h"

static int failures;
#define CHECK(c, ...) do { if (!(c)) { failures++; printf("FAIL: " __VA_ARGS__); printf("\n"); } } while (0)

static void ratings(Ratings *r, int base)
{
    r->spd = base; r->agi = base; r->str = base; r->hands = base; r->skill = base;
    r->tackle = base; r->rush = base; r->arm = base; r->acc = base;
}

int main(void)
{
    rng_seed(2024);
    static const char *outn[] = {"none","tackle","oob","inc","TD","safety","INT","INT-TD","fumble","sack","kneel"};
    for (int pi = 0; pi < 9; pi++) {
        int n = 300, cnt[11] = {0}, comp = 0, att = 0, maxFrames = 0;
        long yds = 0;
        for (int k = 0; k < n; k++) {
            PlaySetup su;
            memset(&su, 0, sizeof su);
            su.losX = YDS(25 + (k % 50));
            su.spotY = YDS(20 + (k % 14));
            su.firstDownX = su.losX + YDS(10);
            su.playIdx = (u8)pi;
            su.iq = (u8)(k % 3);
            su.defCall = 255;
            for (int i = 0; i < NUM_OFF; i++) ratings(&su.off[i], 65);
            for (int i = 0; i < NUM_ACTORS - NUM_OFF; i++) ratings(&su.def[i], 60);
            for (int i = 5; i < 9; i++) su.off[i].spd = 35;
            static PlayState ps;
            play_setup(&ps, &su);
            play_snap(&ps);
            int f = 0;
            while (!play_done(&ps) && f < 4000) {
                u16 h, p, r;
                play_autopilot(&ps, &h, &p, &r);
                play_update(&ps, h, p, r);
                f++;
                for (int i = 0; i < NUM_ACTORS; i++) {
                    if (ps.a[i].x < YDS(-30) || ps.a[i].x > YDS(140)) { CHECK(0, "actor %d out of world", i); break; }
                }
            }
            CHECK(play_done(&ps), "play %d did not finish", pi);
            if (f > maxFrames) maxFrames = f;
            cnt[ps.out.type]++;
            if (ps.out.pass && !ps.out.throwaway) { att++; if (ps.out.complete) comp++; }
            if (ps.out.type == OUT_TACKLE || ps.out.type == OUT_OOB || ps.out.type == OUT_SACK || ps.out.type == OUT_TD)
                yds += (ps.out.spotX - su.losX) / 4096;
        }
        printf("%-10s: ", playbook[pi].name);
        for (int t = 1; t < 11; t++) if (cnt[t]) printf("%s %d ", outn[t], cnt[t]);
        printf("| comp %d/%d avg %.1f yds, max %d frames\n", comp, att, (double)yds / n, maxFrames);
    }
    if (failures) { printf("%d FAILURES\n", failures); return 1; }
    printf("PLAY TESTS PASSED\n");
    return 0;
}
