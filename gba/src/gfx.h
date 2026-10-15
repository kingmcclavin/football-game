/* Video: layers, palettes, text, panels, sprites and the scrolling field. */
#ifndef GFX_H
#define GFX_H

#include "types.h"

/* BG palette banks */
#define PAL_WHITE 0
#define PAL_PANEL 1
#define PAL_YELLOW 2
#define PAL_GRAY 3
#define PAL_GREEN 4
#define PAL_RED 5
#define PAL_CYAN 6
#define PAL_ORANGE 7
#define PAL_FIELD 8
#define PAL_BIG 9
#define PAL_BACK 10
#define PAL_TEAMTXT 11 /* text in a team's colour (set per screen) */

/* OBJ palette banks */
#define OPAL_HOME 0      /* +1 = dark skin */
#define OPAL_AWAY 2      /* +1 = dark skin */
#define OPAL_MISC 4
#define OPAL_CREST 5     /* 5..12 crests */

/* Panel tiles */
#define T_EMPTY 0
#define T_FILL 1
#define T_TL 2
#define T_T 3
#define T_TR 4
#define T_L 5
#define T_R 6
#define T_BL 7
#define T_B 8
#define T_BR 9
#define T_HILITE 10
#define T_BLACK 11
#define T_TEAM1 12
#define T_TEAM2 13
#define T_FILL2 14
#define T_METER0 15 /* 15..23: meter fill 0..8 px */
#define T_TICK 24

/* OBJ tiles */
#define OT_PLAYER 256    /* 32 frames x 16 tiles (32x32) */
#define OT_BALL 36
#define OT_BALL2 37
#define OT_SHADOW 38
#define OT_DOT 39
#define OT_ARROW_G 40
#define OT_ARROW_R 41
#define OT_ARROW_Y 42
#define OT_RETICLE 44
#define OT_LINE_BLUE 48
#define OT_LINE_YELLOW 52
#define OT_GOALPOST 56
#define OT_CREST 64
#define OT_TROPHY 68
#define OT_BIGBALL 84
#define OT_FONT 96       /* 96 glyphs, ASCII c at OT_FONT + c - 32 */

/* sprite shapes/sizes */
#define SPR_8x8 0, 0
#define SPR_16x16 0, 1
#define SPR_32x32 0, 2
#define SPR_8x32 2, 1
#define SPR_16x32 2, 2
#define SPR_32x16 1, 2

extern u32 g_frame;
extern u16 g_perfMax, g_perfLast;

void gfx_init(void);
void gfx_vsync(void);
void gfx_set_mode_menu(void);
void gfx_set_mode_field(void);
void gfx_fade(int level); /* 0 = normal, 16 = black */
void gfx_fade_in(void);
void gfx_fade_out(void);

/* text layer (BG0, 30x20) */
void txt_clear(void);
void txt_put(int x, int y, int c, int pal);
void txt_print(int x, int y, const char *s, int pal);
void txt_printf(int x, int y, int pal, const char *f, ...);
void txt_center(int y, const char *s, int pal);
void txt_clear_rect(int x, int y, int w, int h);
void txt_right(int xr, int y, const char *s, int pal); /* right-aligned ending at xr */

/* panel layer (BG2, 30x20) */
void pnl_clear(void);
void pnl_fill(int x, int y, int w, int h, int tile);
void pnl_box(int x, int y, int w, int h);
void pnl_put(int x, int y, int tile, int pal);
void pnl_meter(int x, int y, int w, int value, int max);

/* palettes */
void pal_team_obj(int bank, int team, int away, int darkSkin);
void pal_team_bg(int bank, int team, int useSecondary);
void pal_field_colors(int homeTeam);
u16 team_rgb(int team, int secondary);

/* sprites */
void oam_begin(void);
void oam_add(int x, int y, int tile, int shape, int size, int pal, int prio, int flags);
void oam_add_blend(int x, int y, int tile, int shape, int size, int pal, int prio);
int oam_count(void);

/* backgrounds */
void bg_menu_backdrop(int style);
void bg_field_build(int homeTeam);
void bg_field_scroll(int camx, int camy);

/* big text (2x font) on the BG1 layer, for titles */
void big_text(int x, int y, const char *s);
void big_text_clear(void);

#define FIELD_MAP_COLS 104
#define FIELD_MAP_W (FIELD_MAP_COLS * 8)
#define FIELD_MAP_H 256
/* world (yards*256) -> field map pixels */
#define FX(xq8) (16 + ((xq8) + 2560) / 40)
#define FY(yq8) (32 + ((yq8) >> 6))

#endif
