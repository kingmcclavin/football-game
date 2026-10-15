#include "save.h"
#include "league.h"
#include "rng.h"
#include <stddef.h>
#include <string.h>

/* Save-type marker. Emulators (mGBA, VBA-M / Delta) scan the ROM for this
 * 4-byte aligned string to pick 32KB battery-backed SRAM. */
__attribute__((used, aligned(4))) const char sram_type_tag[12] = "SRAM_V113";

typedef char career_fits_slot[(sizeof(Career) <= SAVE_SLOT_SIZE) ? 1 : -1];

#ifdef HOST_BUILD
u8 host_sram[0x8000];
void sram_write(u32 offset, const void *src, u32 len)
{
    memcpy(host_sram + offset, src, len);
}
void sram_read(u32 offset, void *dst, u32 len)
{
    memcpy(dst, host_sram + offset, len);
}
#else
#include "gba.h"
/* SRAM sits on an 8-bit bus: byte accesses only. */
void sram_write(u32 offset, const void *src, u32 len)
{
    volatile u8 *d = MEM_SRAM + offset;
    const u8 *s = (const u8 *)src;
    while (len--)
        *d++ = *s++;
}
void sram_read(u32 offset, void *dst, u32 len)
{
    volatile u8 *s = MEM_SRAM + offset;
    u8 *d = (u8 *)dst;
    while (len--)
        *d++ = *s++;
}
#endif

static u32 checksum(const Career *c)
{
    /* word-wise rotate/xor/add hash: cheap on the ARM7, catches corruption */
    const u32 *w = (const u32 *)c;
    u32 n = (u32)offsetof(Career, checksum) / 4;
    u32 h = 0x9E3779B9u;
    for (u32 i = 0; i < n; i++) {
        h = (h << 5) | (h >> 27);
        h ^= w[i];
        h += 0x7F4A7C15u;
    }
    return h;
}

typedef struct {
    u32 magic;
    u16 version;
    u16 size;
    u32 saveCount;
} SaveHeader;

static int slot_valid(int slot, u32 *count)
{
    SaveHeader h;
    sram_read((u32)slot * SAVE_SLOT_SIZE, &h, sizeof(h));
    if (h.magic != SAVE_MAGIC || h.version != SAVE_VERSION || h.size != sizeof(Career))
        return 0;
    /* full checksum check */
    static Career tmp EWRAM_BSS;
    sram_read((u32)slot * SAVE_SLOT_SIZE, &tmp, sizeof(Career));
    if (checksum(&tmp) != tmp.checksum)
        return 0;
    *count = h.saveCount;
    return 1;
}

int save_exists(void)
{
    u32 c;
    return slot_valid(0, &c) || slot_valid(1, &c);
}

int save_write(void)
{
    Career *c = &g_career;
    c->magic = SAVE_MAGIC;
    c->version = SAVE_VERSION;
    c->size = sizeof(Career);
    c->saveCount++;
    c->rngState = rng_state();
    c->checksum = checksum(c);
    int slot = (int)(c->saveCount & 1);
    sram_write((u32)slot * SAVE_SLOT_SIZE, c, sizeof(Career));
    u32 cnt;
    if (!slot_valid(slot, &cnt))
        return 0;
    /* keep the other copy in sync too, so one bad write never loses data */
    sram_write((u32)(slot ^ 1) * SAVE_SLOT_SIZE, c, sizeof(Career));
    return 1;
}

int save_load(void)
{
    u32 ca = 0, cb = 0;
    int va = slot_valid(0, &ca);
    int vb = slot_valid(1, &cb);
    int slot;
    if (va && vb)
        slot = (cb > ca) ? 1 : 0;
    else if (va)
        slot = 0;
    else if (vb)
        slot = 1;
    else
        return 0;
    sram_read((u32)slot * SAVE_SLOT_SIZE, &g_career, sizeof(Career));
    rng_seed(g_career.rngState ^ g_career.saveCount);
    return 1;
}

void save_erase(void)
{
    u8 zero[64];
    memset(zero, 0, sizeof(zero));
    for (u32 o = 0; o < 2 * SAVE_SLOT_SIZE; o += sizeof(zero))
        sram_write(o, zero, sizeof(zero));
}
