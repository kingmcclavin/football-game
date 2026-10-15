#ifndef TYPES_H
#define TYPES_H

#include <stdint.h>

typedef uint8_t u8;
typedef int8_t s8;
typedef uint16_t u16;
typedef int16_t s16;
typedef uint32_t u32;
typedef int32_t s32;
typedef int bool_t;

#ifndef TRUE
#define TRUE 1
#define FALSE 0
#endif

#define ABS(x) ((x) < 0 ? -(x) : (x))
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define MAX(a, b) ((a) > (b) ? (a) : (b))
#define CLAMP(x, lo, hi) ((x) < (lo) ? (lo) : ((x) > (hi) ? (hi) : (x)))
#define COUNTOF(a) ((int)(sizeof(a) / sizeof((a)[0])))

#ifdef HOST_BUILD
#define EWRAM_BSS
#define IWRAM_CODE
#else
#define EWRAM_BSS __attribute__((section(".ewram_bss")))
#define IWRAM_CODE __attribute__((section(".iwram"), long_call, target("arm")))
#endif

#endif
