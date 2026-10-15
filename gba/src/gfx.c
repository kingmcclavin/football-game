#include "gfx.h"
#include "gba.h"
#include "gen_assets.h"
#include "data.h"
#include "util.h"
#include <stdarg.h>
#include <string.h>

u32 g_frame;

#define SB_FIELD 24 /* 24-25: 64x32 field map */
#define SB_PANEL 26
#define SB_TEXT 27
#define SB_BACK 28

#define TILE_BACK 128
#define TILE_FIELD 136
#define TILE_FIELD_MAX 400
#define TILE_BIG 400
#define TILE_BIG_MAX 512

static u16 s_oam[128 * 4];
static int s_oamn;
static int s_fieldMode;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

static volatile u32 *bg_tile(int idx)
{
    return CHARBLOCK(0) + idx * 8;
}

static void put_tile_rows(int idx, const u32 *rows)
{
    volatile u32 *d = bg_tile(idx);
    for (int i = 0; i < 8; i++)
        d[i] = rows[i];
}

static void pix_tile(u32 *rows, int x, int y, int c)
{
    rows[y] = (rows[y] & ~(0xFu << (x * 4))) | ((u32)(c & 15) << (x * 4));
}

static int pix_get(const u32 *rows, int x, int y)
{
    return (rows[y] >> (x * 4)) & 15;
}

static u16 rgb_dim(u16 c, int num, int den)
{
    int r = (c & 31) * num / den, g = ((c >> 5) & 31) * num / den, b = ((c >> 10) & 31) * num / den;
    return RGB15(MIN(r, 31), MIN(g, 31), MIN(b, 31));
}

static u16 rgb_light(u16 c, int add)
{
    int r = (c & 31) + add, g = ((c >> 5) & 31) + add, b = ((c >> 10) & 31) + add;
    return RGB15(MIN(r, 31), MIN(g, 31), MIN(b, 31));
}

u16 team_rgb(int team, int secondary)
{
    const TeamInfo *t = &team_info[team];
    if (secondary)
        return RGB15(t->r2, t->g2, t->b2);
    return RGB15(t->r1, t->g1, t->b1);
}

/* ------------------------------------------------------------------ */
/* palettes                                                            */
/* ------------------------------------------------------------------ */

static void set_text_pal(int bank, u16 c)
{
    MEM_PAL_BG[bank * 16 + 1] = c;
    MEM_PAL_BG[bank * 16 + 2] = RGB15(1, 1, 3);
}

void pal_team_obj(int bank, int team, int away, int darkSkin)
{
    /* index layout: see TEAM_LEGEND in tools/gen_assets.py */
    volatile u16 *p = MEM_PAL_OBJ + bank * 16;
    const TeamInfo *t = &team_info[team];
    u16 c1 = team_rgb(team, 0), c2 = team_rgb(team, 1);
    u16 helmet = t->helmetSecondary ? c2 : c1;
    u16 white = RGB15(29, 29, 30);
    p[1] = helmet;
    p[2] = t->helmetSecondary ? c1 : c2;            /* helmet stripe */
    p[3] = RGB15(22, 22, 24);                       /* facemask */
    p[4] = RGB15(13, 13, 15);
    if (darkSkin) {
        p[5] = RGB15(17, 11, 7);
        p[6] = RGB15(11, 7, 4);
    } else {
        p[5] = RGB15(30, 22, 16);
        p[6] = RGB15(22, 15, 10);
    }
    u16 jersey = away ? white : c1;
    u16 pants = t->pantsPrimary ? c1 : (away ? white : c2);
    if (pants == jersey && !away)
        pants = c2;
    p[7] = jersey;
    p[8] = pants;
    p[9] = rgb_dim(pants, 3, 4);
    p[10] = away ? c1 : white;                      /* socks */
    p[11] = rgb_dim(p[10], 3, 4);
    p[12] = RGB15(3, 3, 4);                         /* cleats */
    p[13] = RGB15(17, 8, 3);                        /* ball */
    p[14] = RGB15(31, 31, 31);
    p[15] = RGB15(2, 2, 4);
}

void pal_team_bg(int bank, int team, int useSecondary)
{
    u16 c = team_rgb(team, useSecondary);
    /* make very dark colours readable as text */
    int lum = (c & 31) + ((c >> 5) & 31) + ((c >> 10) & 31);
    if (lum < 30)
        c = rgb_light(c, 10);
    set_text_pal(bank, c);
}

static void pal_misc(void)
{
    volatile u16 *p = MEM_PAL_OBJ + OPAL_MISC * 16;
    p[1] = RGB15(5, 2, 1);
    p[2] = RGB15(17, 8, 3);
    p[3] = RGB15(24, 14, 8);
    p[4] = RGB15(31, 31, 31);
    p[5] = RGB15(31, 29, 5);
    p[6] = RGB15(6, 14, 31);
    p[7] = RGB15(6, 28, 8);
    p[8] = RGB15(30, 6, 6);
    p[9] = RGB15(1, 3, 1);
    p[10] = RGB15(31, 17, 0);
    p[11] = RGB15(28, 22, 4);
    p[12] = RGB15(31, 30, 17);
    p[13] = RGB15(20, 13, 1);
    p[14] = RGB15(19, 19, 21);
    p[15] = RGB15(10, 10, 12);
}

void pal_field_colors(int homeTeam)
{
    volatile u16 *p = MEM_PAL_BG + PAL_FIELD * 16;
    p[1] = RGB15(5, 15, 5);
    p[2] = RGB15(6, 18, 6);
    p[3] = RGB15(30, 31, 30);
    p[4] = RGB15(4, 13, 4);
    p[5] = RGB15(8, 20, 7);
    p[6] = team_rgb(homeTeam, 0);
    p[7] = team_rgb(homeTeam, 1);
    p[8] = RGB15(9, 12, 6);
    p[9] = RGB15(3, 7, 3);
    p[10] = RGB15(2, 3, 2);
    p[11] = RGB15(26, 6, 6);
    p[12] = RGB15(29, 27, 10);
    p[13] = RGB15(8, 12, 26);
    p[14] = RGB15(28, 28, 28);
    p[15] = RGB15(24, 16, 10);
}

static void pal_init(void)
{
    MEM_PAL_BG[0] = RGB15(2, 3, 8);
    set_text_pal(PAL_WHITE, RGB15(31, 31, 31));
    set_text_pal(PAL_YELLOW, RGB15(31, 28, 6));
    set_text_pal(PAL_GRAY, RGB15(19, 19, 22));
    set_text_pal(PAL_GREEN, RGB15(8, 29, 8));
    set_text_pal(PAL_RED, RGB15(31, 9, 8));
    set_text_pal(PAL_CYAN, RGB15(10, 26, 31));
    set_text_pal(PAL_ORANGE, RGB15(31, 18, 4));
    set_text_pal(PAL_TEAMTXT, RGB15(31, 31, 31));
    volatile u16 *p = MEM_PAL_BG + PAL_PANEL * 16;
    p[1] = RGB15(1, 1, 4);
    p[2] = RGB15(22, 23, 28);
    p[3] = RGB15(3, 5, 13);
    p[4] = RGB15(8, 13, 27);
    p[5] = RGB15(1, 1, 2);
    p[6] = RGB15(20, 4, 4);
    p[7] = RGB15(28, 28, 28);
    p[8] = RGB15(4, 7, 17);
    p[9] = RGB15(8, 28, 8);
    p[10] = RGB15(2, 3, 6);
    p[11] = RGB15(31, 31, 31);
    p[12] = RGB15(31, 26, 4);
    p[13] = RGB15(30, 6, 4);
    p = MEM_PAL_BG + PAL_BIG * 16;
    p[1] = RGB15(31, 29, 8);
    p[2] = RGB15(6, 2, 1);
    p[3] = RGB15(31, 17, 2);
    p = MEM_PAL_BG + PAL_BACK * 16;
    p[1] = RGB15(2, 4, 10);
    p[2] = RGB15(3, 6, 13);
    MEM_PAL_OBJ[0] = 0;
    pal_misc();
    pal_field_colors(0);
}

/* ------------------------------------------------------------------ */
/* tiles                                                               */
/* ------------------------------------------------------------------ */

static void make_panel_tiles(void)
{
    u32 r[8];
    for (int t = T_FILL; t <= T_TICK; t++) {
        for (int y = 0; y < 8; y++) {
            r[y] = 0;
            for (int x = 0; x < 8; x++) {
                int c = 3;
                int top = (t == T_TL || t == T_T || t == T_TR);
                int bot = (t == T_BL || t == T_B || t == T_BR);
                int left = (t == T_TL || t == T_L || t == T_BL);
                int right = (t == T_TR || t == T_R || t == T_BR);
                if (top && y == 0) c = 1;
                else if (bot && y == 7) c = 1;
                else if (left && x == 0) c = 1;
                else if (right && x == 7) c = 1;
                else if (top && y == 1) c = 2;
                else if (bot && y == 6) c = 2;
                else if (left && x == 1) c = 2;
                else if (right && x == 6) c = 2;
                if ((t == T_TL && x + y < 2) || (t == T_TR && (7 - x) + y < 2) ||
                    (t == T_BL && x + (7 - y) < 2) || (t == T_BR && (7 - x) + (7 - y) < 2))
                    c = 0;
                if (t == T_HILITE) c = 4;
                if (t == T_BLACK) c = 5;
                if (t == T_TEAM1) c = 6;
                if (t == T_TEAM2) c = 7;
                if (t == T_FILL2) c = 8;
                if (t >= T_METER0 && t <= T_METER0 + 8) {
                    int k = t - T_METER0;
                    c = (y == 0 || y == 7) ? 1 : (x < k ? 9 : 10);
                }
                if (t == T_TICK)
                    c = (y == 0 || y == 7) ? 1 : ((x == 3 || x == 4) ? 11 : 10);
                r[y] |= (u32)c << (x * 4);
            }
        }
        put_tile_rows(t, r);
    }
    /* menu backdrop tiles */
    for (int par = 0; par < 2; par++) {
        for (int y = 0; y < 8; y++) {
            r[y] = 0;
            for (int x = 0; x < 8; x++) {
                int v = (x + y + par * 8) & 15;
                r[y] |= (u32)(v < 8 ? 1 : 2) << (x * 4);
            }
        }
        put_tile_rows(TILE_BACK + par, r);
    }
}

static void load_obj(int tile, const u32 *data, int ntiles)
{
    volatile u32 *d = MEM_OBJ_TILES + tile * 8;
    for (int i = 0; i < ntiles * 8; i++)
        d[i] = data[i];
}

static void load_obj_tiles(void)
{
    for (int f = 0; f < NUM_PLAYER_FRAMES; f++)
        load_obj(OT_PLAYER + f * 16, player_frames[f], 16);
    load_obj(OT_BALL, spr_ball, 1);
    load_obj(OT_BALL2, spr_ball2, 1);
    load_obj(OT_SHADOW, spr_shadow, 1);
    load_obj(OT_DOT, spr_dot, 1);
    load_obj(OT_ARROW_G, spr_arrow_g, 1);
    load_obj(OT_ARROW_R, spr_arrow_r, 1);
    load_obj(OT_ARROW_Y, spr_arrow_y, 1);
    load_obj(OT_RETICLE, spr_reticle, 4);
    load_obj(OT_LINE_BLUE, spr_line_blue, 4);
    load_obj(OT_LINE_YELLOW, spr_line_yellow, 4);
    load_obj(OT_GOALPOST, spr_goalpost, 8);
    load_obj(OT_CREST, spr_crest, 4);
    load_obj(OT_TROPHY, spr_trophy, 16);
    load_obj(OT_BIGBALL, spr_bigball, 8);
    /* font glyphs as sprites: recolour ink to misc white (4), shadow to dark (1) */
    for (int g = 0; g < 96; g++) {
        u32 rows[8];
        for (int y = 0; y < 8; y++) {
            u32 src = font_tiles[g * 8 + y], dst = 0;
            for (int x = 0; x < 8; x++) {
                int v = (src >> (x * 4)) & 15;
                int c = v == 1 ? 4 : (v == 2 ? 1 : 0);
                dst |= (u32)c << (x * 4);
            }
            rows[y] = dst;
        }
        load_obj(OT_FONT + g, rows, 1);
    }
}

/* ------------------------------------------------------------------ */
/* init / frame                                                        */
/* ------------------------------------------------------------------ */

void gfx_init(void)
{
    REG_WAITCNT = 0x4317;
    REG_DISPCNT = DCNT_BLANK;
    /* clear VRAM */
    volatile u32 *v = (volatile u32 *)MEM_VRAM;
    for (int i = 0; i < 0x18000 / 4; i++)
        v[i] = 0;
    /* font at tile index == ASCII */
    volatile u32 *d = bg_tile(32);
    for (int i = 0; i < 96 * 8; i++)
        d[i] = font_tiles[i];
    make_panel_tiles();
    load_obj_tiles();
    pal_init();
    for (int i = 0; i < 128; i++) {
        s_oam[i * 4] = ATTR0_HIDE;
        s_oam[i * 4 + 1] = 0;
        s_oam[i * 4 + 2] = 0;
    }
    REG_BG0CNT = BG_PRIO(0) | BG_CBB(0) | BG_SBB(SB_TEXT) | BG_SIZE_32x32;
    REG_BG2CNT = BG_PRIO(1) | BG_CBB(0) | BG_SBB(SB_PANEL) | BG_SIZE_32x32;
    gfx_set_mode_menu();
    REG_BLDALPHA = 7 | (9 << 8);
    REG_BLDCNT = 0x0040 | (0x02 << 8);
    REG_DISPSTAT = DSTAT_VBL_IRQ;
    REG_IE = IRQ_VBLANK;
    REG_IME = 1;
}

void gfx_set_mode_menu(void)
{
    s_fieldMode = 0;
    REG_BG1CNT = BG_PRIO(3) | BG_CBB(0) | BG_SBB(SB_BACK) | BG_SIZE_32x32;
    REG_BG1HOFS = 0;
    REG_BG1VOFS = 0;
    REG_DISPCNT = DCNT_MODE0 | DCNT_OBJ_1D | DCNT_BG0 | DCNT_BG1 | DCNT_BG2 | DCNT_OBJ;
}

void gfx_set_mode_field(void)
{
    s_fieldMode = 1;
    REG_BG1CNT = BG_PRIO(3) | BG_CBB(0) | BG_SBB(SB_FIELD) | BG_SIZE_64x32;
    REG_DISPCNT = DCNT_MODE0 | DCNT_OBJ_1D | DCNT_BG0 | DCNT_BG1 | DCNT_BG2 | DCNT_OBJ;
}

static int s_fade;

void gfx_fade(int level)
{
    s_fade = CLAMP(level, 0, 16);
    if (s_fade) {
        REG_BLDCNT = 0x00FF; /* all layers, brightness decrease */
        REG_BLDY = (u16)s_fade;
    } else {
        REG_BLDCNT = 0x0040 | (0x02 << 8);
        REG_BLDY = 0;
    }
}

u16 g_perfMax;  /* worst frame load in scanlines (228 = one full frame) */
u16 g_perfLast;

void gfx_vsync(void)
{
    int v = REG_VCOUNT;
    g_perfLast = (u16)(v >= 160 ? v - 160 : v + 68);
    if (g_perfLast > g_perfMax)
        g_perfMax = g_perfLast;
    vblank_intr_wait();
    volatile u16 *o = MEM_OAM;
    for (int i = 0; i < 128; i++) {
        if (i < s_oamn) {
            o[i * 4] = s_oam[i * 4];
            o[i * 4 + 1] = s_oam[i * 4 + 1];
            o[i * 4 + 2] = s_oam[i * 4 + 2];
        } else {
            o[i * 4] = ATTR0_HIDE;
        }
    }
    g_frame++;
    if (s_fieldMode && (g_frame % 14) == 0) {
        /* crowd shimmer: rotate crowd colours 11..15 */
        volatile u16 *p = MEM_PAL_BG + PAL_FIELD * 16;
        u16 t = p[11];
        for (int i = 11; i < 15; i++)
            p[i] = p[i + 1];
        p[15] = t;
    }
}

void gfx_fade_out(void)
{
    for (int i = 0; i <= 16; i += 2) {
        gfx_fade(i);
        gfx_vsync();
    }
}

void gfx_fade_in(void)
{
    for (int i = 16; i >= 0; i -= 2) {
        gfx_fade(i);
        gfx_vsync();
    }
}

/* ------------------------------------------------------------------ */
/* text                                                                */
/* ------------------------------------------------------------------ */

void txt_clear(void)
{
    volatile u32 *m = (volatile u32 *)SCREENBLOCK(SB_TEXT);
    for (int i = 0; i < 512; i++)
        m[i] = 0;
}

void txt_put(int x, int y, int c, int pal)
{
    if ((unsigned)x >= 30 || (unsigned)y >= 20)
        return;
    if (c < 32 || c > 127)
        c = 32;
    SCREENBLOCK(SB_TEXT)[y * 32 + x] = (u16)(c | (pal << 12));
}

void txt_print(int x, int y, const char *s, int pal)
{
    while (*s) {
        if (*s == '\n') {
            y++;
            s++;
            continue;
        }
        txt_put(x++, y, (u8)*s++, pal);
    }
}

void txt_printf(int x, int y, int pal, const char *f, ...)
{
    char buf[64];
    va_list ap;
    va_start(ap, f);
    vfmt(buf, f, ap);
    va_end(ap);
    txt_print(x, y, buf, pal);
}

void txt_center(int y, const char *s, int pal)
{
    int n = str_len(s);
    txt_print((30 - n) / 2, y, s, pal);
}

void txt_right(int xr, int y, const char *s, int pal)
{
    txt_print(xr - str_len(s) + 1, y, s, pal);
}

void txt_clear_rect(int x, int y, int w, int h)
{
    for (int j = y; j < y + h; j++)
        for (int i = x; i < x + w; i++)
            if ((unsigned)i < 30 && (unsigned)j < 20)
                SCREENBLOCK(SB_TEXT)[j * 32 + i] = 0;
}

/* ------------------------------------------------------------------ */
/* panels                                                              */
/* ------------------------------------------------------------------ */

void pnl_clear(void)
{
    volatile u32 *m = (volatile u32 *)SCREENBLOCK(SB_PANEL);
    for (int i = 0; i < 512; i++)
        m[i] = 0;
}

void pnl_put(int x, int y, int tile, int pal)
{
    if ((unsigned)x >= 32 || (unsigned)y >= 32)
        return;
    SCREENBLOCK(SB_PANEL)[y * 32 + x] = (u16)(tile | (pal << 12));
}

void pnl_fill(int x, int y, int w, int h, int tile)
{
    for (int j = y; j < y + h; j++)
        for (int i = x; i < x + w; i++)
            pnl_put(i, j, tile, PAL_PANEL);
}

void pnl_box(int x, int y, int w, int h)
{
    for (int j = 0; j < h; j++) {
        for (int i = 0; i < w; i++) {
            int t = T_FILL;
            if (j == 0)
                t = (i == 0) ? T_TL : (i == w - 1) ? T_TR : T_T;
            else if (j == h - 1)
                t = (i == 0) ? T_BL : (i == w - 1) ? T_BR : T_B;
            else if (i == 0)
                t = T_L;
            else if (i == w - 1)
                t = T_R;
            pnl_put(x + i, y + j, t, PAL_PANEL);
        }
    }
}

void pnl_meter(int x, int y, int w, int value, int max)
{
    int px = max ? value * w * 8 / max : 0;
    for (int i = 0; i < w; i++) {
        int k = CLAMP(px - i * 8, 0, 8);
        pnl_put(x + i, y, T_METER0 + k, PAL_PANEL);
    }
}

/* ------------------------------------------------------------------ */
/* sprites                                                             */
/* ------------------------------------------------------------------ */

void oam_begin(void)
{
    s_oamn = 0;
}

int oam_count(void)
{
    return s_oamn;
}

static void oam_put(int x, int y, int tile, int shape, int size, int pal, int prio, int flags, int blend)
{
    if (s_oamn >= 128)
        return;
    if (x <= -64 || x >= 240 || y <= -64 || y >= 160)
        return;
    u16 *o = &s_oam[s_oamn * 4];
    o[0] = (u16)(ATTR0_Y(y) | (shape << 14) | (blend ? ATTR0_BLEND : 0));
    o[1] = (u16)(ATTR1_X(x) | (size << 14) | (flags & (ATTR1_HFLIP | ATTR1_VFLIP)));
    o[2] = (u16)(ATTR2_TILE(tile) | ATTR2_PRIO(prio) | ATTR2_PAL(pal));
    s_oamn++;
}

void oam_add(int x, int y, int tile, int shape, int size, int pal, int prio, int flags)
{
    oam_put(x, y, tile, shape, size, pal, prio, flags, 0);
}

void oam_add_blend(int x, int y, int tile, int shape, int size, int pal, int prio)
{
    oam_put(x, y, tile, shape, size, pal, prio, 0, 1);
}

/* ------------------------------------------------------------------ */
/* menu backdrop & big text                                            */
/* ------------------------------------------------------------------ */

void bg_menu_backdrop(int style)
{
    volatile u16 *p = MEM_PAL_BG + PAL_BACK * 16;
    static const u16 cols[4][2] = {
        {RGB15(2, 4, 10), RGB15(3, 6, 13)},
        {RGB15(3, 9, 4), RGB15(4, 11, 5)},
        {RGB15(10, 3, 3), RGB15(13, 4, 4)},
        {RGB15(5, 3, 10), RGB15(7, 4, 13)},
    };
    style &= 3;
    p[1] = cols[style][0];
    p[2] = cols[style][1];
    volatile u16 *m = SCREENBLOCK(SB_BACK);
    for (int y = 0; y < 32; y++)
        for (int x = 0; x < 32; x++)
            m[y * 32 + x] = (u16)((TILE_BACK + ((x + y) & 1)) | (PAL_BACK << 12));
}

static int s_bigNext = TILE_BIG;

void big_text_clear(void)
{
    s_bigNext = TILE_BIG;
}

void big_text(int x, int y, const char *s)
{
    for (; *s; s++, x += 2) {
        int c = (u8)*s;
        if (c == ' ')
            continue;
        if (s_bigNext + 4 > TILE_BIG_MAX)
            return;
        const u32 *g = &font_tiles[(c - 32) * 8];
        for (int ty = 0; ty < 2; ty++) {
            for (int tx = 0; tx < 2; tx++) {
                u32 rows[8];
                for (int py = 0; py < 8; py++) {
                    u32 out = 0;
                    int sy = (ty * 8 + py) >> 1;
                    for (int px = 0; px < 8; px++) {
                        int sx = (tx * 8 + px) >> 1;
                        int v = (g[sy] >> (sx * 4)) & 15;
                        int col = 0;
                        if (v == 1)
                            col = (ty * 8 + py) < 8 ? 1 : 3;
                        else if (v == 2)
                            col = 2;
                        out |= (u32)col << (px * 4);
                    }
                    rows[py] = out;
                }
                put_tile_rows(s_bigNext, rows);
                pnl_put(x + tx, y + ty, s_bigNext, PAL_BIG);
                s_bigNext++;
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* the field                                                           */
/* ------------------------------------------------------------------ */

static u16 s_fieldMap[32 * FIELD_MAP_COLS] EWRAM_BSS;
static s16 s_loadedCol[64];
static u32 s_cacheKey[TILE_FIELD_MAX - TILE_FIELD];
static int s_cacheN;

enum { K_GRASS0, K_GRASS1, K_EZ, K_OUT, K_CROWD, K_BENCH };
enum { R_PLAIN, R_HASH, R_TOP, R_BOTTOM };

#define DESC(kind, line, tick, row, glyph, var) \
    ((u32)(kind) | ((u32)(line) << 3) | ((u32)(tick) << 4) | ((u32)(row) << 8) | ((u32)(glyph) << 10) | ((u32)(var) << 18))

static u32 hash32(u32 x)
{
    x ^= x >> 15;
    x *= 0x2C1B3C6Du;
    x ^= x >> 12;
    x *= 0x297A2D39u;
    x ^= x >> 15;
    return x;
}

static void gen_field_tile(u32 desc, u32 *r)
{
    int kind = desc & 7, line = (desc >> 3) & 1, tick = (desc >> 4) & 15;
    int row = (desc >> 8) & 3, glyph = (desc >> 10) & 0xFF, var = (desc >> 18) & 7;
    for (int y = 0; y < 8; y++) {
        r[y] = 0;
        for (int x = 0; x < 8; x++) {
            int c;
            u32 h = hash32((u32)(x + y * 8 + var * 64 + kind * 512));
            switch (kind) {
            case K_GRASS0:
            case K_GRASS1:
                c = kind == K_GRASS0 ? 1 : 2;
                if ((h & 31) == 0)
                    c = kind == K_GRASS0 ? 4 : 5;
                break;
            case K_EZ:
                c = ((x + y) & 7) < 3 ? 7 : 6;
                break;
            case K_OUT:
                c = (h & 15) == 0 ? 9 : 8;
                break;
            case K_CROWD: {
                /* rows of spectators: heads on a dark stand */
                int head = ((x + (var & 1) * 2) % 3) != 2 && (y % 4) != 3;
                c = head ? 11 + (int)(h % 5) : 10;
                break;
            }
            default:
                c = 9;
                break;
            }
            r[y] |= (u32)c << (x * 4);
        }
    }
    int isField = kind == K_GRASS0 || kind == K_GRASS1 || kind == K_EZ;
    if (isField && line) {
        int y0 = row == R_TOP ? 0 : 0, y1 = row == R_BOTTOM ? 5 : 7;
        for (int y = y0; y <= y1; y++)
            pix_tile(r, 0, y, 3);
    }
    if (kind == K_OUT && line) {
        for (int y = (row == R_TOP ? 0 : 0); y <= (row == R_BOTTOM ? 5 : 7); y++)
            pix_tile(r, 0, y, 3);
    }
    if (row == R_TOP && (isField || kind == K_OUT)) {
        for (int x = 0; x < 8; x++)
            pix_tile(r, x, 0, 3);
        if (tick && kind != K_EZ)
            for (int y = 2; y <= 3; y++)
                pix_tile(r, tick - 1, y, 3);
    }
    if (row == R_BOTTOM && (isField || kind == K_OUT)) {
        for (int x = 0; x < 8; x++) {
            pix_tile(r, x, 5, 3);
            pix_tile(r, x, 6, 9);
            pix_tile(r, x, 7, 9);
        }
        if (tick && kind != K_EZ)
            for (int y = 2; y <= 3; y++)
                pix_tile(r, tick - 1, y, 3);
    }
    if (row == R_HASH && tick && kind != K_EZ)
        for (int y = 2; y <= 4; y++)
            pix_tile(r, tick - 1, y, 3);
    if (glyph) {
        const u32 *g = &font_tiles[(glyph - 32) * 8];
        for (int y = 0; y < 8; y++)
            for (int x = 0; x < 8; x++) {
                int v = (g[y] >> (x * 4)) & 15;
                if (v == 1)
                    pix_tile(r, x, y, 3);
                else if (v == 2 && pix_get(r, x, y) != 3)
                    pix_tile(r, x, y, 10);
            }
    }
}

static u16 field_tile(u32 desc)
{
    for (int i = 0; i < s_cacheN; i++)
        if (s_cacheKey[i] == desc)
            return (u16)((TILE_FIELD + i) | (PAL_FIELD << 12));
    if (s_cacheN >= TILE_FIELD_MAX - TILE_FIELD)
        return (u16)(TILE_FIELD | (PAL_FIELD << 12));
    u32 r[8];
    gen_field_tile(desc, r);
    put_tile_rows(TILE_FIELD + s_cacheN, r);
    s_cacheKey[s_cacheN] = desc;
    s_cacheN++;
    return (u16)((TILE_FIELD + s_cacheN - 1) | (PAL_FIELD << 12));
}

/* Field columns: 0-1 beyond end line, 2-9 left end zone, 10-89 field
 * (goal line at col 10's left edge), 90-97 right end zone, 98+ beyond. */
static u32 field_desc(int col, int row, int homeTeam)
{
    int kind, line = 0, tick = 0, glyph = 0;
    int var = (col + row) & 1;
    if (row <= 2)
        return DESC(K_CROWD, 0, 0, 0, 0, (u32)(hash32((u32)(col * 7 + row)) & 3));
    if (row == 3 || row == 31)
        return DESC(K_BENCH, 0, 0, 0, 0, 0);
    int rtype = R_PLAIN;
    if (row == 4)
        rtype = R_TOP;
    else if (row == 30)
        rtype = R_BOTTOM;
    else if (row == 15 || row == 18)
        rtype = R_HASH;

    if (col < 2 || col >= 98) {
        kind = K_OUT;
        line = (col == 98);
    } else if (col < 10 || col >= 90) {
        kind = K_EZ;
        line = (col == 2 || col == 90);
        /* team abbreviation down the middle of each end zone */
        int lc = col < 10 ? 5 : 94;
        if (col == lc && (row == 13 || row == 16 || row == 19))
            glyph = (u8)team_info[homeTeam].abbr[(row - 13) / 3];
        var = 0;
    } else {
        int rel = col - 10;
        int band = rel >> 2, g = rel & 3;
        kind = (band & 1) ? K_GRASS1 : K_GRASS0;
        line = (g == 0);
        static const u8 ticks[4] = {7, 6, 4, 3};
        tick = ticks[g];
        /* yard numbers every 10 yards */
        if (row == 10 || row == 25) {
            int nextLineBand = band + (g == 3 ? 1 : 0);
            int yards = nextLineBand * 5;
            if ((g == 3 || g == 0) && yards % 10 == 0 && yards > 0 && yards < 100) {
                int num = yards <= 50 ? yards : 100 - yards;
                glyph = (g == 3) ? '0' + num / 10 : '0';
                if (g == 3)
                    tick = 0;
            }
        }
    }
    if (rtype == R_PLAIN)
        tick = 0;
    return DESC(kind, line, tick, rtype, glyph, var);
}

void bg_field_build(int homeTeam)
{
    s_cacheN = 0;
    pal_field_colors(homeTeam);
    for (int row = 0; row < 32; row++)
        for (int col = 0; col < FIELD_MAP_COLS; col++)
            s_fieldMap[row * FIELD_MAP_COLS + col] = field_tile(field_desc(col, row, homeTeam));
    for (int i = 0; i < 64; i++)
        s_loadedCol[i] = -1;
}

static void load_column(int col)
{
    int mc = col & 63;
    volatile u16 *m = SCREENBLOCK(SB_FIELD + (mc >> 5));
    int x = mc & 31;
    int src = CLAMP(col, 0, FIELD_MAP_COLS - 1);
    for (int row = 0; row < 32; row++)
        m[row * 32 + x] = s_fieldMap[row * FIELD_MAP_COLS + src];
    s_loadedCol[mc] = (s16)col;
}

void bg_field_scroll(int camx, int camy)
{
    int c0 = camx >> 3;
    for (int c = c0 - 1; c <= c0 + 31; c++) {
        if (c < 0 || c >= FIELD_MAP_COLS)
            continue;
        if (s_loadedCol[c & 63] != c)
            load_column(c);
    }
    REG_BG1HOFS = (u16)(camx & 511);
    REG_BG1VOFS = (u16)camy;
}
