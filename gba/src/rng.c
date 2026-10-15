#include "rng.h"

static u32 s_state = 0x12345678u;

void rng_seed(u32 seed)
{
    s_state = seed ? seed : 0x9E3779B9u;
}

u32 rng_state(void)
{
    return s_state;
}

u32 rng_next(void)
{
    u32 x = s_state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    s_state = x;
    return x;
}

int rng_range(int n)
{
    if (n <= 1)
        return 0;
    /* 16-bit multiply-shift avoids a division */
    return (int)(((rng_next() >> 16) * (u32)n) >> 16);
}

int rng_between(int lo, int hi)
{
    if (hi <= lo)
        return lo;
    return lo + rng_range(hi - lo + 1);
}

int rng_chance(int pct)
{
    return rng_range(100) < pct;
}

int rng_chance1000(int per)
{
    return rng_range(1000) < per;
}
