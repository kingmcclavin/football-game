#include "match.h"
#include "play.h"
#include "rules.h"
#include "sim.h"
#include "league.h"
#include "gfx.h"
#include "gba.h"
#include "input.h"
#include "sound.h"
#include "ui.h"
#include "rng.h"
#include "util.h"
#include <string.h>

enum { USER = 0, OPP = 1 };

static GameState gs;
static PlayState ps EWRAM_BSS;
static MatchResult *res;
static int s_home, s_away, s_user, s_opp, s_flags;
static TeamStrength s_userStr, s_oppStr;
static Lineup s_userLu, s_oppLu;
static s32 s_spotY;
static int s_camX, s_camY;
static int s_userPal, s_oppPal; /* OBJ palette banks for user / opponent */
static u8 s_skin[NUM_ACTORS];
static int s_lastCalls[4];
static int s_bannerTimer;
static char s_banner[32];
static int s_bannerPal;
static int s_quit;
static int s_demo;
static int s_audibles; /* audibles left this game */

/* demo / attract mode: any button ends the demo */
static void demo_check(void)
{
    if (s_demo && (key_pressed & KEY_MASK))
        s_quit = 1;
}

/* ------------------------------------------------------------------ */
/* ratings                                                             */
/* ------------------------------------------------------------------ */

static void make_ratings(int pidx, int pos, Ratings *r)
{
    int a0 = player_attr(pidx, 0), a1 = player_attr(pidx, 1);
    int a2 = player_attr(pidx, 2), a3 = player_attr(pidx, 3);
    memset(r, 45, sizeof(*r));
    switch (pos) {
    case POS_QB:
        r->arm = (u8)a0; r->acc = (u8)a1; r->spd = (u8)a2; r->agi = (u8)a3;
        r->skill = (u8)a3; r->str = 50; r->tackle = 35;
        break;
    case POS_RB:
        r->spd = (u8)a0; r->agi = (u8)a1; r->str = (u8)a2; r->hands = (u8)a3; r->skill = (u8)a1;
        break;
    case POS_WR:
        r->spd = (u8)a0; r->hands = (u8)a1; r->skill = (u8)a2; r->agi = (u8)a3; r->str = 40;
        break;
    case POS_TE:
        r->spd = (u8)a0; r->hands = (u8)a1; r->skill = (u8)a2; r->str = (u8)a3;
        break;
    case POS_OL:
        r->skill = (u8)((a0 + a1) / 2); r->str = (u8)a2; r->spd = (u8)a3; r->agi = 35;
        break;
    case POS_DL:
        r->rush = (u8)a0; r->tackle = (u8)a1; r->str = (u8)a2; r->spd = (u8)a3; r->skill = (u8)a0;
        break;
    case POS_LB:
        r->tackle = (u8)a0; r->skill = (u8)a1; r->spd = (u8)a2; r->rush = (u8)a3; r->str = 60; r->agi = 55;
        break;
    case POS_DB:
        r->skill = (u8)a0; r->spd = (u8)a1; r->tackle = (u8)a2; r->hands = (u8)a3; r->agi = 60;
        break;
    default:
        break;
    }
}

static const u8 off_slot[NUM_OFF] = {SL_QB, SL_RB, SL_WR1, SL_WR2, SL_TE, SL_OL1, SL_OL2, SL_OL3, SL_OL4};
static const u8 def_slot[NUM_ACTORS - NUM_OFF] = {SL_DL1, SL_DL2, SL_DL3, SL_LB1, SL_LB2, SL_DB1, SL_DB2, SL_DB3, SL_DB4};

static int actor_player(int actor)
{
    if (actor < 0)
        return -1;
    if (actor < NUM_OFF)
        return s_userLu.idx[off_slot[actor]];
    return s_oppLu.idx[def_slot[actor - NUM_OFF]];
}

static int difficulty_iq(void)
{
    int iq = g_career.difficulty;
    if (!(s_flags & MF_EXHIBITION))
        iq += MIN(g_career.seasonNum - 1, 4) / 2; /* the league catches up */
    if (s_flags & MF_PLAYOFF)
        iq++;
    return MIN(iq, 3);
}

static int choose_scheme(void)
{
    int iq = difficulty_iq();
    int pBlitz = 15, pZone = 40;
    if (gs.down == 3 && gs.dist >= 7) {
        pBlitz = 25;
        pZone = 45;
    }
    if (gs.ballOn >= 85)
        pZone = 25;
    if (iq >= 2) {
        /* the defense adapts to tendencies */
        int deep = 0, run = 0;
        for (int i = 0; i < 4; i++) {
            int k = playbook[s_lastCalls[i]].kind;
            if (s_lastCalls[i] == 2 || s_lastCalls[i] == 5)
                deep++;
            if (k == PK_RUN_IN || k == PK_RUN_OUT)
                run++;
        }
        if (deep >= 2)
            pZone += 25;
        if (run >= 2)
            pBlitz += 20;
    }
    int r = rng_range(100);
    if (r < pBlitz)
        return DS_BLITZ;
    if (r < pBlitz + pZone)
        return DS_ZONE;
    return DS_MAN;
}

static void refresh_lineups(void)
{
    team_lineup(s_user, &s_userLu);
    team_lineup(s_opp, &s_oppLu);
    team_strength(s_user, &s_userStr, s_user == s_home ? 2 : 0);
    team_strength(s_opp, &s_oppStr, s_opp == s_home ? 2 : 0);
    int d = g_career.difficulty;
    int adj = (d == DIFF_ROOKIE) ? -5 : (d == DIFF_LEGEND ? 4 : 0);
    s_oppStr.passOff += adj;
    s_oppStr.runOff += adj;
}

static void setup_play(int playIdx)
{
    PlaySetup su;
    memset(&su, 0, sizeof(su));
    su.losX = YDS(gs.ballOn);
    su.spotY = s_spotY;
    su.firstDownX = YDS(MIN(gs.ballOn + gs.dist, 100));
    su.playIdx = (u8)playIdx;
    su.iq = (u8)difficulty_iq();
    static const s8 tb[3] = {-8, 0, 6};
    su.tackleBonus = (u8)(tb[g_career.difficulty] + su.iq * 2);
    su.defCall = (u8)choose_scheme();
    for (int i = 0; i < NUM_OFF; i++)
        make_ratings(s_userLu.idx[off_slot[i]], slot_pos[off_slot[i]], &su.off[i]);
    for (int i = 0; i < NUM_ACTORS - NUM_OFF; i++)
        make_ratings(s_oppLu.idx[def_slot[i]], slot_pos[def_slot[i]], &su.def[i]);
    play_setup(&ps, &su);
    for (int i = 0; i < NUM_ACTORS; i++) {
        int p = actor_player(i);
        s_skin[i] = p >= 0 ? (u8)((g_career.players[p].first + g_career.players[p].last) % 3 == 0) : (u8)(i & 1);
    }
}

/* ------------------------------------------------------------------ */
/* drawing                                                             */
/* ------------------------------------------------------------------ */

static int px_x(s32 x) { return FX(x >> 4); }
static int px_y(s32 y) { return FY(y >> 4); }

static void camera_to(int tx, int ty, int snap)
{
    tx = CLAMP(tx, 0, FIELD_MAP_W - 240);
    ty = CLAMP(ty, 0, FIELD_MAP_H - 160);
    if (snap) {
        s_camX = tx;
        s_camY = ty;
    } else {
        int dx = tx - s_camX, dy = ty - s_camY;
        s_camX += dx / 6 + (dx > 0 ? 1 : dx < 0 ? -1 : 0);
        s_camY += dy / 6 + (dy > 0 ? 1 : dy < 0 ? -1 : 0);
    }
    bg_field_scroll(s_camX, s_camY);
}

static void update_camera(int snap)
{
    int bx = px_x(ps.ball.x), by = px_y(ps.ball.y);
    if (ps.phase == PP_PRESNAP)
        camera_to(bx - 84, by - 84, snap);
    else
        camera_to(bx - (ps.ballSide ? 150 : 96), by - 86, snap);
}

static void draw_line_sprite(int x, int tile)
{
    int sx = x - s_camX - 4;
    if (sx < -8 || sx > 240)
        return;
    int top = FY(0) - s_camY, bottom = FY(FIELD_W >> 4) - s_camY;
    for (int y = top; y < bottom; y += 32) {
        if (y + 32 < 0 || y >= 160)
            continue;
        oam_add(sx, y, tile, SPR_8x32, OPAL_MISC, 3, 0);
    }
}

static void draw_goalposts(void)
{
    int gy = FY(FIELD_W >> 5) - s_camY - 30;
    int gx = FX(YDS(110) >> 4) - s_camX - 8;
    oam_add(gx, gy, OT_GOALPOST, SPR_16x32, OPAL_MISC, 2, 0);
    gx = FX(YDS(-10) >> 4) - s_camX - 8;
    oam_add(gx, gy, OT_GOALPOST, SPR_16x32, OPAL_MISC, 2, 0);
}

static void draw_actors(int showLines)
{
    u8 order[NUM_ACTORS];
    for (int i = 0; i < NUM_ACTORS; i++)
        order[i] = (u8)i;
    /* larger y = closer to the camera = drawn first (on top) */
    for (int i = 1; i < NUM_ACTORS; i++) {
        u8 v = order[i];
        int j = i - 1;
        while (j >= 0 && ps.a[order[j]].y < ps.a[v].y) {
            order[j + 1] = order[j];
            j--;
        }
        order[j + 1] = v;
    }
    /* ball and shadow on top */
    Ball *b = &ps.ball;
    int bx = px_x(b->x) - s_camX, by = px_y(b->y) - s_camY;
    int bz = (b->z * 5) >> 12;
    int inAir = b->state == BALL_AIR || b->state == BALL_PITCH || b->state == BALL_AWAY || b->state == BALL_SNAP;
    if (b->state != BALL_HELD || ps.phase == PP_PRESNAP) {
        oam_add(bx - 4, by - 4 - bz, ((g_frame >> 2) & 1) && inAir ? OT_BALL2 : OT_BALL, SPR_8x8, OPAL_MISC, 2, 0);
        if (inAir)
            oam_add_blend(bx - 4, by - 3, OT_SHADOW, SPR_8x8, OPAL_MISC, 2);
    }
    /* aiming reticle and arc */
    if (ps.aiming) {
        int tx = px_x(ps.aimTx) - s_camX, ty = px_y(ps.aimTy) - s_camY;
        oam_add(tx - 8, ty - 8, OT_RETICLE, SPR_16x16, OPAL_MISC, 2, 0);
        const Actor *q = &ps.a[A_QB];
        s32 T = ps.aimT;
        for (int k = 1; k < 8; k++) {
            s32 t = T * k / 8;
            s32 x = q->x + (ps.aimTx - q->x) / 8 * k;
            s32 y = q->y + (ps.aimTy - q->y) / 8 * k;
            s32 z = YDS(2) - YDS(1) * k / 8 + 4 * (T * T * 3) / T * t / T * (T - t);
            oam_add(px_x(x) - s_camX - 4, px_y(y) - s_camY - 4 - ((z * 5) >> 12), OT_DOT, SPR_8x8, OPAL_MISC, 2, 0);
        }
    }
    /* selected receiver marker */
    if ((ps.phase == PP_LIVE || ps.phase == PP_PRESNAP || ps.phase == PP_SNAP) && ps.sel >= 0 &&
        ps.ballSide == 0 && ps.a[ps.sel].receiver &&
        (ps.play->kind == PK_PASS || ps.play->kind == PK_SCREEN || ps.play->kind == PK_PLAY_ACTION)) {
        const Actor *r = &ps.a[ps.sel];
        int open = play_open(&ps, ps.sel);
        oam_add(px_x(r->x) - s_camX - 4, px_y(r->y) - s_camY - 26 - ((g_frame >> 3) & 1),
                open ? OT_ARROW_G : OT_ARROW_R, SPR_8x8, OPAL_MISC, 2, 0);
    }
    /* route preview before the snap */
    if (ps.phase == PP_PRESNAP) {
        for (int i = A_RB; i <= A_TE; i++) {
            const Actor *a = &ps.a[i];
            if (!a->receiver || !a->nwp)
                continue;
            s32 px = a->x, py = a->y;
            for (int w = 0; w <= a->nwp; w++) {
                s32 tx, ty;
                if (w < a->nwp) {
                    tx = a->wx[w];
                    ty = a->wy[w];
                } else {
                    if (a->settle)
                        break;
                    /* arrow-like continuation of the last leg */
                    s32 bx = a->nwp > 1 ? a->wx[a->nwp - 2] : a->ax, by = a->nwp > 1 ? a->wy[a->nwp - 2] : a->ay;
                    s32 dx = a->wx[a->nwp - 1] - bx, dy = a->wy[a->nwp - 1] - by;
                    s32 l = approx_len(dx, dy);
                    if (l < 1)
                        break;
                    tx = px + dx * YDS(5) / l;
                    ty = py + dy * YDS(5) / l;
                }
                s32 l = approx_len(tx - px, ty - py);
                int n = CLAMP(l / YDS(2.5), 1, 8);
                for (int k = 1; k <= n; k++) {
                    s32 x = px + (tx - px) / n * k, y = py + (ty - py) / n * k;
                    oam_add(px_x(x) - s_camX - 4, px_y(y) - s_camY - 4, OT_DOT, SPR_8x8, OPAL_MISC, 3, 0);
                }
                px = tx;
                py = ty;
            }
        }
    }
    for (int k = 0; k < NUM_ACTORS; k++) {
        int i = order[k];
        const Actor *a = &ps.a[i];
        int fx = px_x(a->x) - s_camX, fy = px_y(a->y) - s_camY;
        int pal = (a->side == 0 ? s_userPal : s_oppPal) + s_skin[i];
        oam_add(fx - 16, fy - 30, OT_PLAYER + a->frame * 16, SPR_32x32, pal, 2, a->flip ? ATTR1_HFLIP : 0);
    }
    for (int i = 0; i < NUM_ACTORS; i++) {
        const Actor *a = &ps.a[i];
        oam_add_blend(px_x(a->x) - s_camX - 4, px_y(a->y) - s_camY - 3, OT_SHADOW, SPR_8x8, OPAL_MISC, 2);
    }
    draw_goalposts();
    if (showLines) {
        draw_line_sprite(px_x(ps.su.losX), OT_LINE_BLUE);
        if (ps.su.firstDownX < YDS(100))
            draw_line_sprite(px_x(ps.su.firstDownX), OT_LINE_YELLOW);
    }
}

static void spot_text(char *out, int ballOn)
{
    if (ballOn == 50)
        fmt(out, "MIDFIELD");
    else if (ballOn < 50)
        fmt(out, "OWN %d", ballOn);
    else
        fmt(out, "OPP %d", 100 - ballOn);
}

static void down_text(char *out)
{
    char spot[16];
    spot_text(spot, gs.ballOn);
    if (gs.conversion)
        fmt(out, "2-PT TRY");
    else if (gs.ballOn + gs.dist >= 100)
        fmt(out, "%s&GOAL %s", gs_down_str(gs.down), spot);
    else
        fmt(out, "%s&%d %s", gs_down_str(gs.down), gs.dist, spot);
}

static void draw_scoreboard(int liveSeconds)
{
    char buf[32], clk[8];
    pnl_fill(0, 0, 30, 1, T_BLACK);
    txt_clear_rect(0, 0, 30, 1);
    pal_team_bg(PAL_TEAMTXT, s_user, 0);
    txt_print(0, 0, team_info[s_user].abbr, PAL_TEAMTXT);
    if (gs.poss == USER)
        txt_put(3, 0, '~', PAL_ORANGE);
    fmt(buf, "%d", gs.score[USER]);
    txt_print(4, 0, buf, PAL_WHITE);
    int clock = MAX(0, gs.clock - liveSeconds);
    fmt_clock(clk, clock);
    if (gs.quarter <= 4)
        fmt(buf, "Q%d %s", gs.quarter, clk);
    else
        fmt(buf, "OT %s", clk);
    txt_print(8, 0, buf, PAL_YELLOW);
    if (gs.poss == USER) {
        if (gs.conversion)
            fmt(buf, "TRY");
        else if (gs.ballOn + gs.dist >= 100)
            fmt(buf, "%d&G", gs.down);
        else
            fmt(buf, "%d&%d", gs.down, gs.dist);
        txt_print(16, 0, buf, PAL_CYAN);
    }
    fmt(buf, "%d", gs.score[OPP]);
    txt_right(24, 0, buf, PAL_WHITE);
    if (gs.poss == OPP)
        txt_put(25, 0, '~', PAL_ORANGE);
    txt_print(26, 0, team_info[s_opp].abbr, PAL_RED);
}

static void draw_bottom(const char *s, int pal)
{
    pnl_fill(0, 19, 30, 1, T_BLACK);
    txt_clear_rect(0, 19, 30, 1);
    txt_print(1, 19, s, pal);
}

static void banner(const char *s, int pal, int frames)
{
    str_copy(s_banner, s, sizeof(s_banner));
    s_bannerPal = pal;
    s_bannerTimer = frames;
}

static void draw_banner(void)
{
    if (s_bannerTimer <= 0)
        return;
    s_bannerTimer--;
    int n = str_len(s_banner);
    int x = (30 - n) / 2 - 1;
    if (s_bannerTimer == 0) {
        txt_clear_rect(0, 3, 30, 3);
        pnl_fill(0, 3, 30, 3, T_EMPTY);
        return;
    }
    pnl_box(x, 3, n + 2, 3);
    txt_print(x + 1, 4, s_banner, s_bannerPal);
}

static void field_frame(int showLines, int liveSeconds)
{
    oam_begin();
    draw_actors(showLines);
    draw_scoreboard(liveSeconds);
    draw_banner();
    ui_frame();
    demo_check();
}

/* ------------------------------------------------------------------ */
/* menus over the field                                                */
/* ------------------------------------------------------------------ */

static void clear_overlay(int y, int h)
{
    txt_clear_rect(0, y, 30, h);
    pnl_fill(0, y, 30, h, T_EMPTY);
}

static int pause_menu(void)
{
    static const char *const items[] = {"RESUME", "HOW TO PLAY", "SIMULATE REST", "QUIT GAME"};
    u32 dis = (s_flags & MF_EXHIBITION) ? 0 : (1u << 3);
    for (;;) {
        clear_overlay(1, 18);
        txt_center(4, "PAUSED", PAL_YELLOW);
        int r = ui_menu(8, 6, 15, items, 4, 0, dis);
        clear_overlay(1, 18);
        if (r == 1) {
            show_controls();
            gfx_set_mode_field();
            txt_clear();
            pnl_clear();
            bg_field_scroll(s_camX, s_camY);
            continue;
        }
        if (r == 2) {
            if (ui_confirm("Simulate the rest of this game?"))
                return 2;
            continue;
        }
        if (r == 3) {
            if (ui_confirm("Quit this game?"))
                return 3;
            continue;
        }
        return 0;
    }
}

/* The coach's call: picks a play for the situation. With allowKicks = 0
 * it never returns PUNT / FIELD GOAL (4th-down kicks are the player's
 * choice). */
static int ai_play_call_k(int conversion, int allowKicks)
{
    if (conversion)
        return rng_chance(50) ? 6 : 0;
    int fgd = gs_fg_distance(&gs);
    int behind = gs.score[USER] < gs.score[OPP];
    if (gs.down == 4 && allowKicks) {
        int late = gs.quarter >= 4 && gs.clock < 150 && behind;
        if (fgd <= 50 && !(late && gs.score[OPP] - gs.score[USER] > 3))
            return 11;
        if (!late && (gs.ballOn < 55 || gs.dist > 3))
            return 10;
    }
    if (gs.quarter >= 4 && gs.clock < 90 && !behind && gs.score[USER] > gs.score[OPP])
        return 9;
    if (gs.dist <= 2)
        return rng_chance(60) ? (rng_chance(50) ? 6 : 8) : rng_range(4);
    if (gs.down == 3 && gs.dist >= 7)
        return rng_chance(30) ? 2 : rng_range(4);
    if (gs.down == 4)
        return rng_chance(50) ? 0 : 1; /* going for it: high-percentage throws */
    if (gs.ballOn >= 90)
        return rng_chance(40) ? 6 : (rng_chance(50) ? 0 : 3);
    static const u8 mix[10] = {0, 1, 2, 3, 4, 5, 6, 7, 0, 1};
    return mix[rng_range(10)];
}

static int ai_play_call(int conversion)
{
    return ai_play_call_k(conversion, 1);
}

/* Audible menu. Returns the new play, -10 if cancelled with B, or
 * -code if the game was ended from the pause menu. Kicks are not
 * available here: they are chosen on 4th down. */
static int audible_menu(int conversion, int current)
{
    int sel = current;
    char buf[40];
    u32 dis = (1u << 10) | (1u << 11);
    if (conversion)
        dis |= (1u << 9);
    if ((dis >> sel) & 1)
        sel = 0;
    snd_play(SFX_WHISTLE);
    for (;;) {
        pnl_box(0, 11, 30, 8);
        txt_clear_rect(1, 12, 28, 6);
        for (int i = 0; i < NUM_PLAYS; i++) {
            int col = i / 6, row = i % 6;
            int x = 2 + col * 14, y = 12 + row;
            int pal = (dis >> i) & 1 ? PAL_GRAY : (i == sel ? PAL_YELLOW : PAL_WHITE);
            pnl_fill(x - 1, y, 13, 1, i == sel ? T_HILITE : T_FILL);
            if (i == sel)
                txt_put(x - 1, y, '`', PAL_YELLOW);
            txt_print(x, y, playbook[i].name, pal);
        }
        str_copy(buf, playbook[sel].desc, sizeof(buf));
        draw_bottom(buf, PAL_CYAN);
        txt_clear_rect(0, 1, 30, 1);
        pnl_fill(0, 1, 30, 1, T_BLACK);
        fmt(buf, "AUDIBLE (%d LEFT)", s_audibles - 1);
        txt_print(1, 1, buf, PAL_ORANGE);
        txt_right(28, 1, "B:CANCEL", PAL_GRAY);
        s_bannerTimer = 0;
        oam_begin();
        draw_actors(1);
        draw_scoreboard(0);
        ui_frame();
        int old = sel;
        if (key_repeat & KEY_DOWN) sel = (sel % 6 == 5) ? sel - 5 : sel + 1;
        if (key_repeat & KEY_UP) sel = (sel % 6 == 0) ? sel + 5 : sel - 1;
        if (key_repeat & (KEY_LEFT | KEY_RIGHT)) sel = (sel + 6) % 12;
        if (sel != old) {
            snd_play(SFX_MOVE);
            if (!((dis >> sel) & 1)) {
                setup_play(sel);
                update_camera(1);
            }
        }
        if (key_pressed & KEY_A) {
            if ((dis >> sel) & 1) {
                snd_play(SFX_ERROR);
                continue;
            }
            snd_play(SFX_OK);
            break;
        }
        if (key_pressed & KEY_B) {
            snd_play(SFX_BACK);
            clear_overlay(1, 19);
            return -10;
        }
        if (key_pressed & KEY_START) {
            clear_overlay(1, 19);
            int r = pause_menu();
            if (r)
                return -r;
        }
    }
    clear_overlay(1, 19);
    return sel;
}

/* 4th down: go for it, punt or kick? Returns 0 go, 10 punt, 11 FG,
 * or -code from the pause menu. */
static int fourth_down_menu(void)
{
    if (s_demo) {
        int c = ai_play_call(0);
        return (c == 10 || c == 11) ? c : 0;
    }
    char fg[24], hdr[32];
    int fgd = gs_fg_distance(&gs);
    fmt(fg, "FIELD GOAL %d YD", fgd);
    const char *items[3] = {"GO FOR IT", "PUNT", fg};
    u32 dis = 0;
    if (gs.ballOn > 60)
        dis |= 2;
    if (fgd > 70)
        dis |= 4;
    int sel = (fgd <= 45) ? 2 : (gs.ballOn <= 60 && gs.dist > 2 ? 1 : 0);
    for (;;) {
        setup_play(sel == 1 ? 10 : 11);
        update_camera(1);
        oam_begin();
        draw_actors(1);
        draw_scoreboard(0);
        clear_overlay(1, 19);
        down_text(hdr);
        pnl_box(5, 4, 20, 3);
        txt_print(7, 5, hdr, PAL_YELLOW);
        draw_bottom("4TH DOWN DECISION", PAL_CYAN);
        int c = ui_menu(5, 9, 20, items, 3, sel, dis);
        clear_overlay(1, 19);
        if (c >= 0)
            return c == 0 ? 0 : (c == 1 ? 10 : 11);
        int r = pause_menu();
        if (r)
            return -r;
    }
}

/* ------------------------------------------------------------------ */
/* kicking                                                             */
/* ------------------------------------------------------------------ */

enum { KICK_FG, KICK_XP, KICK_PUNT };

static void kick_flight(s32 sx, s32 sy, s32 tx, s32 ty, int frames, int apexYds)
{
    Ball *b = &ps.ball;
    for (int t = 0; t <= frames; t++) {
        b->x = sx + (tx - sx) / frames * t;
        b->y = sy + (ty - sy) / frames * t;
        b->z = YDS(apexYds) * 4 / frames * t / frames * (frames - t);
        b->state = t < frames ? BALL_AIR : BALL_DEAD;
        update_camera(0);
        field_frame(0, 0);
    }
}

/* Returns PlayResult for the kick. */
static void do_kick(int type, PlayResult *r)
{
    int kidx = s_userLu.idx[SL_K];
    int kpwr = player_attr(kidx, 0), kacc = player_attr(kidx, 1);
    int dist = type == KICK_XP ? 33 : gs_fg_distance(&gs);
    memset(r, 0, sizeof(*r));
    /* line up: everyone in place, holder at 7 yards back */
    setup_play(type == KICK_PUNT ? 10 : 11);
    for (int i = 0; i < NUM_ACTORS; i++) {
        Actor *a = &ps.a[i];
        if (i == A_QB) {
            a->x = YDS(gs.ballOn) - YDS(type == KICK_PUNT ? 14 : 7);
            a->y = s_spotY;
        }
        if (i == A_RB) {
            a->x = YDS(gs.ballOn) - YDS(type == KICK_PUNT ? 14 : 8);
            a->y = s_spotY - YDS(1.5);
        }
        if (i == A_WR1 || i == A_WR2)
            a->y = s_spotY + (i == A_WR1 ? -YDS(6) : YDS(6));
        if (i >= A_CB1)
            a->x = YDS(gs.ballOn) + YDS(type == KICK_PUNT ? 40 : 6);
    }
    ps.ball.x = ps.a[A_QB].x;
    ps.ball.y = s_spotY;
    ps.ball.z = YDS(0.3);
    ps.ball.state = BALL_DEAD;
    update_camera(1);

    char buf[32];
    pnl_box(0, 13, 30, 6);
    txt_clear_rect(1, 14, 28, 4);
    if (type == KICK_PUNT)
        fmt(buf, "PUNT  K PWR %d", kpwr);
    else
        fmt(buf, "%d YD %s  K PWR %d ACC %d", dist, type == KICK_XP ? "XP" : "FG", kpwr, kacc);
    txt_print(1, 14, buf, PAL_YELLOW);
    txt_print(1, 15, "POWER", PAL_WHITE);
    txt_print(1, 17, "AIM", PAL_WHITE);
    draw_bottom("PRESS A TO SET POWER", PAL_CYAN);
    int power = 0, dir = 1, stage = 0, aim = 0, adir = 1;
    int aimSpeed = 6 - kacc / 25; /* better kickers: slower needle */
    if (aimSpeed < 2)
        aimSpeed = 2;
    /* window that counts as straight */
    int window = (type == KICK_PUNT) ? 60 : CLAMP(20 + (60 - dist) / 2 + kacc / 8, 10, 60);
    int demoPower = rng_between(78, 96), demoAim = rng_between(-window, window);
    for (;;) {
        if (stage == 0) {
            power += dir * 3;
            if (power >= 100) {
                power = 100;
                dir = -1;
            }
            if (power <= 0) {
                power = 0;
                dir = 1;
            }
        } else if (stage == 1) {
            aim += adir * aimSpeed;
            if (aim >= 100) {
                aim = 100;
                adir = -1;
            }
            if (aim <= -100) {
                aim = -100;
                adir = 1;
            }
        }
        pnl_meter(7, 15, 16, power, 100);
        /* aim bar: centre zone highlighted */
        for (int i = 0; i < 16; i++) {
            int lo = i * 200 / 16 - 100, hi = (i + 1) * 200 / 16 - 100;
            int inWin = hi > -window && lo < window;
            pnl_put(7 + i, 17, inWin ? T_METER0 + 8 : T_METER0, PAL_PANEL);
        }
        oam_begin();
        int ax = 7 * 8 + (aim + 100) * 128 / 200 - 4;
        if (stage >= 1)
            oam_add(ax, 17 * 8 - 7, OT_ARROW_Y, SPR_8x8, OPAL_MISC, 0, 0);
        draw_actors(0);
        draw_scoreboard(0);
        ui_frame();
        demo_check();
        int hit = key_pressed & KEY_A;
        if (s_demo)
            hit = (stage == 0 && dir > 0 && power >= demoPower) || (stage == 1 && ABS(aim - demoAim) <= aimSpeed);
        if (hit || s_quit) {
            snd_play(SFX_MOVE);
            if (stage == 0) {
                stage = 1;
                draw_bottom("PRESS A TO AIM", PAL_CYAN);
            } else {
                break;
            }
        }
    }
    clear_overlay(13, 7);
    snd_play(SFX_KICK);
    /* overpowering adds a random hook */
    if (power > 94)
        aim += (rng_range(2) ? 1 : -1) * (power - 94) * 4;
    s32 kx = ps.a[A_QB].x, ky = s_spotY;
    if (type == KICK_PUNT) {
        int d = 22 + power * (18 + kpwr / 5) / 100;
        if (ABS(aim) > window)
            d -= 12 + rng_range(8); /* shanked */
        d = CLAMP(d, 10, 70);
        int land = gs.ballOn + d;
        s32 ty = CLAMP(s_spotY + aim * YDS(0.12), YDS(2), FIELD_W - YDS(2));
        kick_flight(kx, ky, YDS(MIN(land, 105)), ty, 50 + d / 2, 10 + d / 4);
        r->type = PT_PUNT;
        r->yards = (s8)d;
        r->retYards = (s8)(land >= 100 ? 0 : (rng_chance(25) ? 0 : rng_between(0, 10)));
        r->seconds = 8;
        if (land >= 100)
            fmt(buf, "PUNT %d YDS, TOUCHBACK", d);
        else if (r->retYards == 0)
            fmt(buf, "PUNT %d YDS, FAIR CATCH", d);
        else
            fmt(buf, "PUNT %d YDS, RETURN %d", d, r->retYards);
        banner(buf, PAL_WHITE, 120);
        return;
    }
    int maxDist = 44 + kpwr / 5;
    int reach = maxDist * power / 100;
    int good = reach >= dist && ABS(aim) <= window;
    s32 ty = FIELD_W / 2 + aim * YDS(0.07);
    s32 tx = good || reach >= dist ? YDS(112) : YDS(gs.ballOn + reach - 7 + 3);
    kick_flight(kx, ky, tx, ty, 34 + dist / 2, good || reach >= dist ? 12 : 8);
    r->type = type == KICK_XP ? PT_XP : PT_FG;
    r->good = (u8)good;
    r->seconds = 5;
    if (type == KICK_FG) {
        res->fga++;
        if (good)
            res->fgm++;
    }
    if (good) {
        snd_play(SFX_GOOD);
        banner("IT'S GOOD!", PAL_GREEN, 120);
    } else {
        snd_play(SFX_MISS);
        if (reach < dist)
            banner("NO GOOD - SHORT", PAL_RED, 120);
        else
            banner(aim < 0 ? "NO GOOD - WIDE LEFT" : "NO GOOD - WIDE RIGHT", PAL_RED, 120);
    }
}

/* ------------------------------------------------------------------ */
/* events                                                              */
/* ------------------------------------------------------------------ */

static void wait_frames(int n, int showLines)
{
    for (int i = 0; i < n; i++) {
        update_camera(0);
        field_frame(showLines, 0);
        if ((i > 20 && (key_pressed & KEY_A)) || s_quit)
            break;
    }
}

static void show_stats_box(const char *title)
{
    char buf[32];
    pnl_box(2, 3, 26, 14);
    txt_clear_rect(3, 4, 24, 12);
    txt_center(4, title, PAL_YELLOW);
    fmt(buf, "%s %d  -  %s %d", team_info[s_user].abbr, gs.score[USER], team_info[s_opp].abbr, gs.score[OPP]);
    txt_center(6, buf, PAL_WHITE);
    fmt(buf, "PASSING  %d/%d %d YDS", res->passComp, res->passAtt, res->passYds);
    txt_print(4, 8, buf, PAL_WHITE);
    fmt(buf, "RUSHING  %d ATT %d YDS", res->rushAtt, res->rushYds);
    txt_print(4, 9, buf, PAL_WHITE);
    fmt(buf, "TD %d  INT %d  SACKED %d", res->passTD + res->rushTD, res->ints, res->sacks);
    txt_print(4, 10, buf, PAL_WHITE);
    fmt(buf, "FG %d/%d  1ST DOWNS %d", res->fgm, res->fga, res->firstDowns);
    txt_print(4, 11, buf, PAL_WHITE);
    fmt(buf, "OPP TOTAL YARDS %d", res->oppYds);
    txt_print(4, 13, buf, PAL_GRAY);
    txt_center(15, s_demo ? "DEMO" : "PRESS A", PAL_CYAN);
    if (s_demo) {
        for (int i = 0; i < 150 && !s_quit; i++) {
            ui_frame();
            demo_check();
        }
    } else {
        ui_wait_button();
    }
    clear_overlay(1, 18);
}

static void handle_clock_events(u32 ev)
{
    if (ev & EV_TWO_MIN)
        banner("TWO MINUTE WARNING", PAL_ORANGE, 90);
    if (ev & EV_END_QUARTER) {
        char buf[24];
        fmt(buf, "END OF Q%d", gs.quarter - 1);
        banner(buf, PAL_YELLOW, 100);
        wait_frames(80, 0);
    }
    if (ev & EV_HALFTIME) {
        snd_play(SFX_WHISTLE);
        show_stats_box("HALFTIME");
        s_spotY = FIELD_W / 2;
    }
    if (ev & EV_OT) {
        snd_play(SFX_WHISTLE);
        banner("OVERTIME! NEXT SCORE WINS", PAL_ORANGE, 150);
        s_spotY = FIELD_W / 2;
        wait_frames(100, 0);
    }
}

static void kickoff_message(u32 ev)
{
    char buf[32], sp[16];
    if (!(ev & EV_KICKOFF))
        return;
    spot_text(sp, gs.ballOn);
    if (ev & EV_TOUCHBACK)
        fmt(buf, "KICKOFF: TOUCHBACK");
    else
        fmt(buf, "KICKOFF RETURNED TO %s", sp);
    if (gs.poss == USER)
        banner(buf, PAL_WHITE, 110);
    s_spotY = FIELD_W / 2;
}

/* ------------------------------------------------------------------ */
/* the opponent's possession (simulated, user picks the defense)       */
/* ------------------------------------------------------------------ */

static int opponent_drive(void)
{
    char line[96], desc[48], hdr[48];
    int call;
    static const char *const calls[NUM_DEF_CALLS] = {"BALANCED", "BLITZ", "PREVENT", "RUN STOP"};
    int ballOnStart = gs.ballOn;
    int conversionOnly = gs.conversion;
    /* field view: show the defense lined up from the opponent's view */
    camera_to(px_x(YDS(100 - gs.ballOn)) - 120, px_y(FIELD_W / 2) - 84, 1);
    if (conversionOnly) {
        call = DC_BALANCED;
    } else {
        for (;;) {
            clear_overlay(1, 18);
            char sp[16];
            spot_text(sp, gs.ballOn);
            fmt(hdr, "%s BALL AT THEIR %d", team_info[s_opp].abbr, gs.ballOn);
            pnl_box(1, 2, 28, 4);
            txt_print(3, 3, hdr, PAL_YELLOW);
            txt_print(3, 4, "CHOOSE YOUR DEFENSE", PAL_WHITE);
            /* description of the highlighted call is shown after selection */
            if (s_demo) {
                call = rng_range(NUM_DEF_CALLS);
                break;
            }
            call = ui_menu(7, 7, 16, calls, NUM_DEF_CALLS, 0, 0);
            if (call >= 0)
                break;
            int r = pause_menu();
            if (r)
                return r;
        }
    }
    clear_overlay(1, 18);
    pnl_box(0, 2, 30, 16);
    fmt(hdr, "%s OFFENSE  vs  %s", team_info[s_opp].abbr, conversionOnly ? "TRY" : calls[call]);
    txt_print(1, 3, hdr, PAL_YELLOW);
    txt_print(1, 4, conversionOnly ? "" : def_call_desc[call], PAL_GRAY);
    int row = 6;
    int skip = 0;
    for (int guard = 0; guard < 40; guard++) {
        int startOn = gs.ballOn;
        if (gs.conversion)
            fmt(line, "TRY: ");
        else
        {
            int goal = gs.ballOn + gs.dist >= 100;
            const char *side = gs.ballOn >= 50 ? team_info[s_user].abbr : team_info[s_opp].abbr;
            int yl = gs.ballOn > 50 ? 100 - gs.ballOn : gs.ballOn;
            if (goal)
                fmt(line, "%d&G  %s%2d ", gs.down, side, yl);
            else
                fmt(line, "%d&%-2d %s%2d ", gs.down, MIN(gs.dist, 99), side, yl);
        }
        PlayResult r;
        sim_play(&gs, &s_oppStr, &s_userStr, call, &r, desc, 0);
        u32 ev = gs_apply_play(&gs, &r);
        if (r.type == PT_RUN || r.type == PT_PASS)
            res->oppYds += (u16)MAX(0, r.yards);
        str_copy(line + str_len(line), desc, 30);
        line[29] = 0; /* one screen row */
        if (row > 16) {
            txt_clear_rect(1, 6, 28, 11);
            row = 6;
        }
        int pal = PAL_WHITE;
        if (ev & EV_TD)
            pal = PAL_RED;
        else if (ev & (EV_TURNOVER | EV_MISS | EV_PUNT))
            pal = PAL_GREEN;
        else if (ev & EV_FG_GOOD)
            pal = PAL_ORANGE;
        else if (ev & EV_TRY_GOOD)
            pal = PAL_ORANGE;
        txt_print(1, row++, line, pal);
        (void)startOn;
        if (ev & EV_TD) {
            snd_play(ev & EV_DEF_TD ? SFX_TOUCHDOWN : SFX_MISS);
        } else if (ev & (EV_TURNOVER)) {
            snd_play(SFX_TURNOVER);
        } else if (r.type == PT_SACK) {
            snd_play(SFX_TACKLE);
        } else {
            snd_play(SFX_SNAP);
        }
        if (ev & EV_TWO_MIN) {
            txt_print(1, row++, "  -- TWO MINUTE WARNING --", PAL_ORANGE);
        }
        draw_scoreboard(0);
        int wait = skip ? 4 : (s_demo ? 30 : 42);
        for (int i = 0; i < wait; i++) {
            oam_begin();
            draw_scoreboard(0);
            ui_frame();
            demo_check();
            if (s_quit)
                return 3;
            if (key_pressed & KEY_A)
                break;
            if (key_held & KEY_B)
                skip = 1;
        }
        if (ev & (EV_END_QUARTER | EV_HALFTIME | EV_OT | EV_GAMEOVER)) {
            txt_print(1, row++, ev & EV_GAMEOVER ? "  -- FINAL --" : (ev & EV_HALFTIME) ? "  -- HALFTIME --" : "  -- END OF QUARTER --", PAL_YELLOW);
            for (int i = 0; i < 60; i++)
                ui_frame();
            demo_check();
            clear_overlay(1, 18);
            handle_clock_events(ev);
            kickoff_message(ev);
            return 0;
        }
        if (gs.over)
            break;
        if (gs.poss == USER && !gs.conversion) {
            kickoff_message(ev);
            break;
        }
    }
    (void)ballOnStart;
    if (s_demo) {
        for (int i = 0; i < 60 && !s_quit; i++) {
            ui_frame();
            demo_check();
        }
    } else {
        txt_center(17, "PRESS A", PAL_CYAN);
        ui_wait_button();
    }
    clear_overlay(1, 18);
    return s_quit ? 3 : 0;
}

/* ------------------------------------------------------------------ */
/* one user snap                                                       */
/* ------------------------------------------------------------------ */

static void apply_injury(int actor)
{
    int p = actor_player(actor);
    if (p < 0 || (s_flags & MF_EXHIBITION))
        return;
    Player *pl = &g_career.players[p];
    int w = rng_between(1, 4);
    if (g_career.fac[FAC_REHAB] && rng_chance(g_career.fac[FAC_REHAB] * 15))
        w = MAX(1, w - 1);
    pl->injury = (u8)w;
    char buf[40];
    fmt(buf, "%s INJURED (%d WK)", player_last_name(pl), w);
    banner(buf, PAL_RED, 140);
}

static void play_events(u32 ev)
{
    if (ev & PE_SNAP)
        snd_play(SFX_SNAP);
    if (ev & PE_THROW)
        snd_play(SFX_THROW);
    if (ev & PE_CATCH) {
        snd_play(SFX_CATCH);
        if (ev & PE_DIVING)
            banner("DIVING CATCH!", PAL_YELLOW, 70);
        else if (ev & PE_BIGCATCH)
            banner("WHAT A CATCH!", PAL_YELLOW, 60);
    }
    if (ev & PE_JUKE)
        snd_play(SFX_JUKE);
    if (ev & PE_MISSED_TACKLE) {
        snd_play(SFX_TACKLE);
        banner(ev & PE_STIFFARM ? "STIFF ARM!" : "BROKEN TACKLE!", PAL_YELLOW, 45);
    }
    if (ev & PE_TACKLE)
        snd_play(SFX_TACKLE);
    if (ev & PE_INT) {
        snd_play(SFX_TURNOVER);
        banner("INTERCEPTED!", PAL_RED, 60);
    }
    if (ev & (PE_DROP | PE_BROKEN_UP | PE_INCOMPLETE))
        snd_play(SFX_WHISTLE);
}

/* run one user offensive snap (or kick). Returns pause-menu code. */
static int user_snap(void)
{
    char buf[40];
    int conversion = gs.conversion;
    if (conversion) {
        clear_overlay(1, 19);
        static const char *const items[2] = {"EXTRA POINT KICK", "2-POINT TRY"};
        setup_play(11);
        update_camera(1);
        oam_begin();
        draw_actors(1);
        draw_scoreboard(0);
        int c = s_demo ? (rng_chance(85) ? 0 : 1) : ui_menu(6, 11, 19, items, 2, 0, 0);
        clear_overlay(1, 19);
        if (c != 1) {
            PlayResult r;
            do_kick(KICK_XP, &r);
            wait_frames(90, 0);
            u32 ev = gs_apply_play(&gs, &r);
            handle_clock_events(ev);
            kickoff_message(ev);
            return 0;
        }
    }
    PlayResult r;
    memset(&r, 0, sizeof(r));
    if (gs.down == 4 && !conversion) {
        int k = fourth_down_menu();
        if (k < 0)
            return -k;
        if (k == 10 || k == 11) {
            do_kick(k == 10 ? KICK_PUNT : KICK_FG, &r);
            wait_frames(100, 0);
            u32 ev = gs_apply_play(&gs, &r);
            handle_clock_events(ev);
            kickoff_message(ev);
            s_spotY = FIELD_W / 2;
            return 0;
        }
    }
    /* the coach calls the play; the player may audible (3 per game) */
    int call = ai_play_call_k(conversion, 0);
    setup_play(call);
    update_camera(1);
    for (int f = 0;; f++) {
        if (f == 0) {
            clear_overlay(1, 19);
            txt_clear_rect(0, 1, 30, 1);
            pnl_fill(0, 1, 30, 1, T_BLACK);
            txt_print(1, 1, playbook[call].name, PAL_YELLOW);
            if (s_audibles > 0)
                fmt(buf, "B:AUDIBLE x%d", s_audibles);
            else
                fmt(buf, "NO AUDIBLES");
            txt_right(28, 1, buf, s_audibles ? PAL_ORANGE : PAL_GRAY);
            down_text(buf);
            draw_bottom(buf, PAL_WHITE);
            txt_right(28, 19, "A:SNAP", PAL_CYAN);
        }
        field_frame(1, 0);
        if (s_quit)
            return 3;
        if (s_demo) {
            if (f > 40)
                break;
            continue;
        }
        if (key_pressed & KEY_A)
            break;
        if (key_pressed & KEY_START) {
            clear_overlay(1, 19);
            int q = pause_menu();
            if (q)
                return q;
            f = -1;
            continue;
        }
        if (key_pressed & KEY_B) {
            if (s_audibles <= 0) {
                snd_play(SFX_ERROR);
                banner("NO AUDIBLES LEFT", PAL_RED, 60);
                continue;
            }
            int a = audible_menu(conversion, call);
            if (a <= -1 && a != -10)
                return -a;
            if (a >= 0) {
                s_audibles--;
                call = a;
                banner("AUDIBLE!", PAL_ORANGE, 50);
            }
            setup_play(call);
            update_camera(1);
            f = -1;
        }
    }
    txt_clear_rect(0, 1, 30, 1);
    pnl_fill(0, 1, 30, 1, T_EMPTY);
    if (!conversion) {
        for (int i = 3; i > 0; i--)
            s_lastCalls[i] = s_lastCalls[i - 1];
        s_lastCalls[0] = call;
    }
    play_snap(&ps);
    play_events(ps.events);
    g_perfMax = 0; /* measure only the live play */
    int hintShown = 0;
    while (!play_done(&ps)) {
        u16 held = key_held, pressed = key_pressed, released = key_released;
        if (s_demo)
            play_autopilot(&ps, &held, &pressed, &released);
        play_update(&ps, held, pressed, released);
        if (s_quit)
            return 3;
        play_events(ps.events);
        if (ps.out.injured >= 0 && ps.phase == PP_DEAD && ps.deadTimer == 74)
            apply_injury(ps.out.injured);
        update_camera(0);
        /* bottom bar: context help / power meter */
        if (ps.aiming) {
            pnl_fill(0, 19, 30, 1, T_BLACK);
            txt_clear_rect(0, 19, 30, 1);
            txt_print(1, 19, "LOB", PAL_GRAY);
            pnl_meter(5, 19, 12, ps.power, 100);
            txt_print(18, 19, "BULLET", PAL_GRAY);
            hintShown = 0;
        } else if (!hintShown) {
            if (ps.phase == PP_LIVE && ps.carrier == A_QB && ps.ballSide == 0 &&
                (ps.play->kind == PK_PASS || ps.play->kind == PK_SCREEN || ps.play->kind == PK_PLAY_ACTION))
                draw_bottom("HOLD A:AIM  L/R:TARGET  B:AWAY", PAL_CYAN);
            else if (ps.phase == PP_RUN && ps.carrier == ps.user)
                draw_bottom("A:JUKE  B:DIVE  R:STIFF ARM", PAL_CYAN);
            else
                draw_bottom("", PAL_CYAN);
            hintShown = 1;
        }
        if (ps.phase == PP_RUN || ps.phase == PP_DEAD)
            hintShown = hintShown && (ps.phase == PP_RUN);
        field_frame(1, ps.frame / 60);
        if (ps.phase == PP_DEAD && (key_pressed & KEY_A) && ps.deadTimer < 50)
            break;
    }
    draw_bottom("", PAL_WHITE);

    /* translate the outcome */
    Outcome *o = &ps.out;
    s32 los = ps.su.losX;
    int yards = (o->spotX - los + (o->spotX >= los ? 2048 : -2048)) / 4096;
    r.seconds = (u8)CLAMP(o->frames / 60 + 1, 2, 40);
    r.oob = 0;
    int carrierIsPasser = 0;
    switch (o->type) {
    case OUT_TD:
        yards = 100 - gs.ballOn;
        r.type = o->complete ? PT_PASS : PT_RUN;
        break;
    case OUT_TACKLE:
    case OUT_KNEEL:
        r.type = o->type == OUT_KNEEL ? PT_KNEEL : (o->complete ? PT_PASS : PT_RUN);
        break;
    case OUT_OOB:
        r.type = o->complete ? PT_PASS : PT_RUN;
        r.oob = 1;
        break;
    case OUT_SACK:
        r.type = PT_SACK;
        carrierIsPasser = 1;
        break;
    case OUT_SAFETY:
        r.type = PT_SACK;
        yards = -gs.ballOn;
        break;
    case OUT_INCOMPLETE:
        r.type = PT_INCOMPLETE;
        yards = 0;
        break;
    case OUT_INT:
    case OUT_INT_TD: {
        r.type = PT_INT;
        int intAt = (o->intX - los) / 4096;
        int endAt = (o->spotX - los) / 4096;
        r.yards = (s8)CLAMP(intAt, -20, 110);
        r.retYards = (s8)CLAMP(intAt - endAt, 0, 120);
        if (o->type == OUT_INT_TD)
            r.retYards = (s8)MIN(120, gs.ballOn + intAt + 1);
        yards = r.yards;
        break;
    }
    case OUT_FUMBLE:
        r.type = PT_FUMBLE;
        r.retYards = 0;
        break;
    default:
        r.type = PT_INCOMPLETE;
        break;
    }
    (void)carrierIsPasser;
    if (r.type != PT_INT)
        r.yards = (s8)CLAMP(yards, -99, 100);
    /* the try after a touchdown */
    if (conversion) {
        r.type = PT_TWO;
        r.good = o->type == OUT_TD;
    }

    /* stats */
    int sacked = o->type == OUT_SACK;
    if (!conversion) {
        if (o->pass && !o->throwaway && !sacked)
            res->passAtt++;
        else if (o->throwaway)
            res->passAtt++;
        if (o->pass && o->complete) {
            res->passComp++;
            res->passYds += (u16)MAX(0, r.yards);
            if (o->type == OUT_TD)
                res->passTD++;
        } else if (!o->pass && (o->type == OUT_TACKLE || o->type == OUT_OOB || o->type == OUT_TD || o->type == OUT_FUMBLE)) {
            res->rushAtt++;
            res->rushYds += (u16)r.yards;
            if (o->type == OUT_TD)
                res->rushTD++;
        }
        if (o->type == OUT_INT || o->type == OUT_INT_TD)
            res->ints++;
        if (o->type == OUT_FUMBLE)
            res->fumbles++;
        if (sacked)
            res->sacks++;
    }

    u32 ev = gs_apply_play(&gs, &r);
    if (ev & EV_FIRSTDOWN)
        res->firstDowns++;
    /* keep the ball where the play ended (between the hashes) */
    if (o->type == OUT_TACKLE || o->type == OUT_OOB)
        s_spotY = CLAMP(o->spotY, YDS(23.5), YDS(29.8));
    if (ev & (EV_TURNOVER | EV_TD | EV_KICKOFF))
        s_spotY = FIELD_W / 2;

    /* result banner */
    int pal = PAL_WHITE;
    if (conversion) {
        if (r.good) {
            fmt(buf, "2-POINT TRY IS GOOD!");
            pal = PAL_GREEN;
            snd_play(SFX_GOOD);
        } else {
            fmt(buf, "2-POINT TRY FAILS");
            pal = PAL_RED;
            snd_play(SFX_MISS);
        }
    } else if (ev & EV_DEF_TD) {
        fmt(buf, "PICK SIX!");
        pal = PAL_RED;
        snd_play(SFX_TURNOVER);
    } else if (ev & EV_TD) {
        fmt(buf, "TOUCHDOWN!");
        pal = PAL_YELLOW;
        snd_play(SFX_TOUCHDOWN);
    } else if (ev & EV_SAFETY) {
        fmt(buf, "SAFETY!");
        pal = PAL_RED;
        snd_play(SFX_TURNOVER);
    } else if (o->type == OUT_INT) {
        fmt(buf, "INTERCEPTED!");
        pal = PAL_RED;
    } else if (o->type == OUT_FUMBLE) {
        fmt(buf, "FUMBLE! TURNOVER");
        pal = PAL_RED;
        snd_play(SFX_TURNOVER);
    } else if (ev & EV_DOWNS) {
        fmt(buf, "TURNOVER ON DOWNS");
        pal = PAL_RED;
        snd_play(SFX_TURNOVER);
    } else if (o->type == OUT_SACK) {
        fmt(buf, "SACKED! %d", r.yards);
        pal = PAL_RED;
    } else if (o->type == OUT_INCOMPLETE) {
        if (o->throwaway)
            fmt(buf, "THROWN AWAY");
        else if (ps.events & PE_DROP)
            fmt(buf, "DROPPED!");
        else
            fmt(buf, "INCOMPLETE");
        pal = PAL_GRAY;
    } else if (ev & EV_FIRSTDOWN) {
        fmt(buf, "FIRST DOWN! +%d", r.yards);
        pal = PAL_GREEN;
        snd_play(SFX_FIRSTDOWN);
    } else if (o->type == OUT_KNEEL) {
        fmt(buf, "KNEEL DOWN");
    } else if (r.yards > 0) {
        fmt(buf, "GAIN OF %d", r.yards);
    } else if (r.yards < 0) {
        fmt(buf, "LOSS OF %d", -r.yards);
    } else {
        fmt(buf, "NO GAIN");
    }
    if (o->type == OUT_OOB && !(ev & (EV_FIRSTDOWN | EV_TD)))
        str_copy(buf + str_len(buf), ", OUT", 8);
    banner(buf, pal, 100);
    if (ev & EV_TD)
        snd_play(SFX_TOUCHDOWN);
    wait_frames(ev & EV_TD ? 110 : 60, 0);
    handle_clock_events(ev);
    kickoff_message(ev);
    return 0;
}

/* ------------------------------------------------------------------ */
/* game                                                                */
/* ------------------------------------------------------------------ */

static void sim_rest(void)
{
    char desc[40];
    for (int guard = 0; guard < 800 && !gs.over; guard++) {
        PlayResult r;
        int o = gs.poss;
        sim_play(&gs, o == USER ? &s_userStr : &s_oppStr, o == USER ? &s_oppStr : &s_userStr, DC_BALANCED, &r, desc, 0);
        if (o == USER && !gs.conversion) {
            if (r.type == PT_PASS) {
                res->passAtt++;
                res->passComp++;
                res->passYds += (u16)MAX(0, r.yards);
            } else if (r.type == PT_INCOMPLETE) {
                res->passAtt++;
            } else if (r.type == PT_RUN) {
                res->rushAtt++;
                res->rushYds += (u16)r.yards;
            } else if (r.type == PT_INT) {
                res->passAtt++;
                res->ints++;
            }
        }
        u32 ev = gs_apply_play(&gs, &r);
        if (o == USER && (ev & EV_TD) && !(ev & EV_DEF_TD)) {
            if (r.type == PT_PASS)
                res->passTD++;
            else
                res->rushTD++;
        }
    }
    if (!gs.allowTie && gs.score[0] == gs.score[1])
        gs.score[rng_range(2)] += 3;
    res->simulated = 1;
}

static int coin_toss(void)
{
    static const char *const items[2] = {"HEADS", "TAILS"};
    clear_overlay(1, 18);
    pnl_box(4, 3, 22, 4);
    txt_center(4, "COIN TOSS", PAL_YELLOW);
    txt_center(5, "CALL IT IN THE AIR!", PAL_WHITE);
    oam_begin();
    draw_scoreboard(0);
    int c = s_demo ? 0 : ui_menu(9, 8, 12, items, 2, 0, 0);
    if (c < 0)
        c = 0;
    int flip = rng_range(2);
    for (int i = 0; i < 40; i++) {
        oam_begin();
        oam_add(112, 70 - (i < 20 ? i : 40 - i) * 2, (i >> 2) & 1 ? OT_BALL2 : OT_BALL, SPR_8x8, OPAL_MISC, 0, 0);
        draw_scoreboard(0);
        ui_frame();
    }
    snd_play(SFX_COIN);
    int won = (c == flip);
    clear_overlay(1, 18);
    pnl_box(3, 5, 24, 5);
    txt_center(6, flip ? "IT'S TAILS!" : "IT'S HEADS!", PAL_YELLOW);
    txt_center(8, won ? "YOU WON - YOU RECEIVE" : "THEY WON - THEY RECEIVE", PAL_WHITE);
    if (s_demo) {
        for (int i = 0; i < 60; i++)
            ui_frame();
    } else {
        ui_wait_button();
    }
    clear_overlay(1, 18);
    return won ? USER : OPP;
}

static void compute_mvp(void)
{
    /* the user's QB if he threw well, else the RB, else a WR */
    res->mvp = -1;
    if (res->passYds >= 150 || res->passTD >= 2)
        res->mvp = s_userLu.idx[SL_QB];
    else if (res->rushYds >= 80)
        res->mvp = s_userLu.idx[SL_RB];
    else
        res->mvp = s_userLu.idx[SL_WR1];
}

void match_play(int home, int away, int user, int flags, MatchResult *out)
{
    res = out;
    memset(res, 0, sizeof(*res));
    s_home = home;
    s_away = away;
    s_user = user;
    s_opp = user == home ? away : home;
    s_flags = flags;
    s_quit = 0;
    s_demo = (flags & MF_DEMO) != 0;
    s_audibles = 3;
    memset(s_lastCalls, 0, sizeof(s_lastCalls));
    refresh_lineups();

    /* uniforms: home team in colours, away team in white */
    s_userPal = OPAL_HOME;
    s_oppPal = OPAL_AWAY;
    pal_team_obj(OPAL_HOME, s_user, s_user != home, 0);
    pal_team_obj(OPAL_HOME + 1, s_user, s_user != home, 1);
    pal_team_obj(OPAL_AWAY, s_opp, s_opp != home, 0);
    pal_team_obj(OPAL_AWAY + 1, s_opp, s_opp != home, 1);

    music_stop();
    gfx_fade(16);
    txt_clear();
    pnl_clear();
    oam_begin();
    bg_field_build(home);
    gfx_set_mode_field();
    s_spotY = FIELD_W / 2;
    gs_init(&gs, (g_career.quarterMin ? g_career.quarterMin : 4) * 60, !(flags & MF_PLAYOFF), USER);
    setup_play(0);
    camera_to(px_x(YDS(50)) - 120, px_y(FIELD_W / 2) - 84, 1);
    field_frame(0, 0);
    gfx_fade_in();
    snd_play(SFX_CROWD);

    int receiver = coin_toss();
    gs_init(&gs, gs.qlen, !(flags & MF_PLAYOFF), receiver);
    kickoff_message(EV_KICKOFF | (gs.ballOn == 25 ? EV_TOUCHBACK : 0));

    while (!gs.over) {
        int r;
        refresh_lineups();
        if (gs.poss == USER) {
            int behind = gs.score[USER] <= gs.score[OPP];
            gs.hurry[USER] = 0;
            if ((gs.quarter == 2 || gs.quarter >= 4) && gs.clock <= 120 && (gs.quarter == 2 || behind))
                gs.hurry[USER] = 1;
            if (gs.quarter >= 4 && !behind && gs.clock <= 300)
                gs.hurry[USER] = 2;
            r = user_snap();
        } else {
            r = opponent_drive();
        }
        if (r == 2) {
            sim_rest();
            break;
        }
        if (r == 3 || s_quit) {
            s_quit = 1;
            break;
        }
    }
    res->userScore = gs.score[USER];
    res->oppScore = gs.score[OPP];
    compute_mvp();
    if (s_quit)
        res->simulated = 2;
    if (!s_quit) {
        int win = res->userScore > res->oppScore;
        snd_play(SFX_WHISTLE);
        music_play(win ? MUS_VICTORY : (res->userScore < res->oppScore ? MUS_DEFEAT : MUS_VICTORY));
        show_stats_box(win ? "FINAL - YOU WIN!" : (res->userScore < res->oppScore ? "FINAL - YOU LOSE" : "FINAL - TIE GAME"));
    }
    gfx_fade_out();
    oam_begin();
    gfx_set_mode_menu();
    txt_clear();
    pnl_clear();
    gfx_vsync();
    gfx_fade(0);
}

/* ------------------------------------------------------------------ */
/* how to play                                                         */
/* ------------------------------------------------------------------ */

void show_controls(void)
{
    static const char *const titles[] = {"PASSING", "RUNNING", "KICKING & DEFENSE", "RULES & CAREER"};
    static const char *const pages[] = {
        "The coach calls each play. B = AUDIBLE to pick your own (3 per game). "
        "A snaps. D-PAD moves the QB, L/R picks the target (green = open). "
        "HOLD A to aim, RELEASE to throw; B throws it away.",

        "Your runner always heads upfield. UP/DOWN steer, LEFT cuts back, "
        "RIGHT is full speed.\n"
        "A: JUKE  B: DIVE  R: STIFF ARM\n"
        "Fast, agile players break more tackles. Follow your blockers!",

        "Kicks: press A to stop the POWER meter, then A when the AIM arrow is "
        "in the green zone. Too much power hooks the ball.\n"
        "Opponent drives are simulated: pick BLITZ, PREVENT, RUN STOP or "
        "BALANCED. Hold B to fast-forward.",

        "4 downs to gain 10 yards. TD 6, kick 1 or go for 2, FG 3, safety 2. "
        "Ties go to sudden-death OT.\n"
        "Between games: train players, sign free agents, upgrade facilities "
        "and chase the " CHAMPIONSHIP_NAME ". START pauses.",
    };
    int page = 0, n = COUNTOF(pages);
    int redraw = 1;
    gfx_set_mode_menu();
    for (;;) {
        if (redraw) {
            ui_screen(0);
            char t[24];
            fmt(t, "HOW TO PLAY  %d/%d", page + 1, n);
            ui_title(t, 0);
            pnl_box(1, 3, 28, 15);
            txt_print(3, 4, titles[page], PAL_YELLOW);
            ui_paragraph(3, 6, 25, pages[page], PAL_WHITE);
            ui_hint("LEFT/RIGHT: PAGE  B: BACK");
            redraw = 0;
        }
        ui_frame();
        if (key_pressed & (KEY_RIGHT | KEY_A)) {
            if (page < n - 1) {
                page++;
                redraw = 1;
                snd_play(SFX_MOVE);
            } else if (key_pressed & KEY_A) {
                break;
            }
        }
        if ((key_pressed & KEY_LEFT) && page > 0) {
            page--;
            redraw = 1;
            snd_play(SFX_MOVE);
        }
        if (key_pressed & (KEY_B | KEY_START))
            break;
    }
    snd_play(SFX_BACK);
}
