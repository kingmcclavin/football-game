#ifndef UTIL_H
#define UTIL_H

#include "types.h"
#include <stdarg.h>

/* Tiny printf: %d %u %s %c %x, optional width and '0' pad, %%. */
int fmt(char *out, const char *f, ...);
int vfmt(char *out, const char *f, va_list ap);
int str_len(const char *s);
void str_copy(char *dst, const char *src, int max);
u32 isqrt32(u32 v);
/* Approximate vector length (max + min*3/8), good to ~4%. */
s32 approx_len(s32 dx, s32 dy);
/* Clock text "M:SS" */
void fmt_clock(char *out, int seconds);
/* Money text in $M from $100K units: "12.5M" */
void fmt_money(char *out, int units);

#endif
