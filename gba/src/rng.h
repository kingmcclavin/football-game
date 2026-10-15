#ifndef RNG_H
#define RNG_H
#include "types.h"

void rng_seed(u32 seed);
u32 rng_state(void);
u32 rng_next(void);
/* Uniform integer in [0, n). */
int rng_range(int n);
/* Uniform integer in [lo, hi]. */
int rng_between(int lo, int hi);
/* TRUE with probability pct/100. */
int rng_chance(int pct);
/* TRUE with probability per/1000. */
int rng_chance1000(int per);
#endif
