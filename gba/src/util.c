#include "util.h"
#include <stdarg.h>

static char *put_uint(char *o, u32 v, int width, char pad, int base)
{
    char tmp[12];
    int n = 0;
    do {
        int d = (int)(v % (u32)base);
        tmp[n++] = (char)(d < 10 ? '0' + d : 'A' + d - 10);
        v /= (u32)base;
    } while (v && n < 12);
    while (n < width) {
        *o++ = pad;
        width--;
    }
    while (n)
        *o++ = tmp[--n];
    return o;
}

int fmt(char *out, const char *f, ...)
{
    va_list ap;
    va_start(ap, f);
    int n = vfmt(out, f, ap);
    va_end(ap);
    return n;
}

int vfmt(char *out, const char *f, va_list ap)
{
    char *o = out;
    while (*f) {
        if (*f != '%') {
            *o++ = *f++;
            continue;
        }
        f++;
        char pad = ' ';
        int width = 0, left = 0;
        char *start = o;
        if (*f == '-') {
            left = 1;
            f++;
        }
        if (*f == '0') {
            pad = '0';
            f++;
        }
        while (*f >= '0' && *f <= '9')
            width = width * 10 + (*f++ - '0');
        if (left) {
            /* format without width, then pad on the right */
            int w = width;
            width = 0;
            (void)w;
        }
        switch (*f) {
        case 'd': {
            int v = va_arg(ap, int);
            if (v < 0) {
                *o++ = '-';
                if (width)
                    width--;
                o = put_uint(o, (u32)(-v), width, pad, 10);
            } else {
                o = put_uint(o, (u32)v, width, pad, 10);
            }
            break;
        }
        case 'u':
            o = put_uint(o, va_arg(ap, unsigned), width, pad, 10);
            break;
        case 'x':
            o = put_uint(o, va_arg(ap, unsigned), width, pad, 16);
            break;
        case 's': {
            const char *s = va_arg(ap, const char *);
            int n = str_len(s);
            while (n < width) {
                *o++ = ' ';
                width--;
            }
            while (*s)
                *o++ = *s++;
            break;
        }
        case 'c':
            *o++ = (char)va_arg(ap, int);
            break;
        case '%':
            *o++ = '%';
            break;
        default:
            break;
        }
        if (left) {
            /* re-read the requested width from the format text */
            const char *q = f - 1;
            int w = 0, mul = 1;
            while (*q >= '0' && *q <= '9') {
                w += (*q - '0') * mul;
                mul *= 10;
                q--;
            }
            while ((int)(o - start) < w)
                *o++ = ' ';
        }
        if (*f)
            f++;
    }
    *o = 0;
    return (int)(o - out);
}

int str_len(const char *s)
{
    int n = 0;
    while (s[n])
        n++;
    return n;
}

void str_copy(char *dst, const char *src, int max)
{
    int i = 0;
    while (src[i] && i < max - 1) {
        dst[i] = src[i];
        i++;
    }
    dst[i] = 0;
}

u32 isqrt32(u32 v)
{
    u32 r = 0, b = 1u << 30;
    while (b > v)
        b >>= 2;
    while (b) {
        if (v >= r + b) {
            v -= r + b;
            r = (r >> 1) + b;
        } else {
            r >>= 1;
        }
        b >>= 2;
    }
    return r;
}

s32 approx_len(s32 dx, s32 dy)
{
    if (dx < 0)
        dx = -dx;
    if (dy < 0)
        dy = -dy;
    if (dx < dy) {
        s32 t = dx;
        dx = dy;
        dy = t;
    }
    return dx + ((dy * 3) >> 3);
}

void fmt_clock(char *out, int seconds)
{
    if (seconds < 0)
        seconds = 0;
    fmt(out, "%d:%02d", seconds / 60, seconds % 60);
}

void fmt_money(char *out, int units)
{
    if (units < 0) {
        *out++ = '-';
        units = -units;
    }
    fmt(out, "%d.%dM", units / 10, units % 10);
}
