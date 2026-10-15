#include "screens.h"
#include "league.h"
#include "season.h"
#include "offseason.h"
#include "match.h"
#include "sim.h"
#include "save.h"
#include "gfx.h"
#include "gba.h"
#include "input.h"
#include "sound.h"
#include "ui.h"
#include "rng.h"
#include "util.h"
#include <string.h>

#define DEL_CHAR 127 /* left-pointing cursor glyph */

static int s_hasSave;

/* ------------------------------------------------------------------ */
/* generic scrolling list                                              */
/* ------------------------------------------------------------------ */

typedef void (*RowFn)(int idx, int x, int y, int selected);

/* Blocking list. Returns selected index, -1 on B, or -2 when one of
 * `extra` keys is pressed (key in *keyOut). */
static int list_run(int count, int *sel, int *top, int x, int y, int w, int rows, RowFn draw,
                    u16 extra, u16 *keyOut)
{
    int redraw = 1;
    if (*sel >= count)
        *sel = count - 1;
    if (*sel < 0)
        *sel = 0;
    for (;;) {
        if (*sel < *top)
            *top = *sel;
        if (*sel >= *top + rows)
            *top = *sel - rows + 1;
        if (redraw) {
            for (int r = 0; r < rows; r++) {
                int i = *top + r;
                txt_clear_rect(x, y + r, w, 1);
                pnl_fill(x, y + r, w, 1, (i == *sel && i < count) ? T_HILITE : T_FILL);
                if (i < count)
                    draw(i, x, y + r, i == *sel);
            }
            /* scroll indicators */
            txt_put(x + w - 1, y, *top > 0 ? '^' : ' ', PAL_GRAY);
            txt_put(x + w - 1, y + rows - 1, *top + rows < count ? '}' : ' ', PAL_GRAY);
            redraw = 0;
        }
        ui_frame();
        if (count > 0) {
            int old = *sel;
            if (key_repeat & KEY_DOWN)
                *sel = (*sel + 1) % count;
            if (key_repeat & KEY_UP)
                *sel = (*sel + count - 1) % count;
            if (key_repeat & KEY_RIGHT && rows > 1)
                *sel = MIN(count - 1, *sel + rows);
            if (key_repeat & KEY_LEFT && rows > 1 && !(extra & KEY_LEFT))
                *sel = MAX(0, *sel - rows);
            if (*sel != old) {
                snd_play(SFX_MOVE);
                redraw = 1;
            }
            if (key_pressed & KEY_A) {
                snd_play(SFX_OK);
                return *sel;
            }
        }
        if (key_pressed & extra) {
            if (keyOut)
                *keyOut = key_pressed & extra;
            return -2;
        }
        if (key_pressed & KEY_B) {
            snd_play(SFX_BACK);
            return -1;
        }
    }
}

/* ------------------------------------------------------------------ */
/* small helpers                                                       */
/* ------------------------------------------------------------------ */

static void team_name(char *out, int t)
{
    fmt(out, "%s %s", team_info[t].city, team_info[t].name);
}

static int user_team(void)
{
    return g_career.userTeam;
}

static void autosave(void)
{
    if (!save_write()) {
        ui_message("SAVE ERROR", "Could not write the save. Check the save type (SRAM 32K) in your emulator.");
    }
    s_hasSave = 1;
}

static const char *finish_name(int f)
{
    static const char *const n[5] = {"Missed playoffs", "Lost div. round", "Lost conf. final",
                                     "Lost " CHAMPIONSHIP_NAME, "CHAMPIONS!"};
    return n[CLAMP(f, 0, 4)];
}

static void ovr_color_text(int x, int y, int ovr)
{
    char b[4];
    fmt(b, "%2d", ovr);
    int pal = ovr >= 80 ? PAL_GREEN : ovr >= 65 ? PAL_WHITE : ovr >= 50 ? PAL_ORANGE : PAL_RED;
    txt_print(x, y, b, pal);
}

/* column header for player lists: POS NAME OVR AGE <last> */
static void list_header(int y, const char *last)
{
    txt_print(1, y, "POS", PAL_GRAY);
    txt_print(5, y, "NAME", PAL_GRAY);
    txt_print(17, y, "OVR", PAL_GRAY);
    txt_print(21, y, "AGE", PAL_GRAY);
    txt_right(27, y, last, PAL_GRAY);
}

/* ------------------------------------------------------------------ */
/* player card                                                         */
/* ------------------------------------------------------------------ */

enum { CARD_ROSTER, CARD_FA, CARD_RESIGN, CARD_DRAFT, CARD_VIEW };

static void draw_player_card(int pidx, int mode)
{
    const Player *p = &g_career.players[pidx];
    char buf[40], money[12];
    ui_screen(1);
    player_full_name(p, buf);
    ui_title(buf, pos_info[p->pos].abbr);
    pnl_box(1, 3, 28, 9);
    if (p->number)
        fmt(buf, "#%d  %s", p->number, pos_info[p->pos].name);
    else
        fmt(buf, "%s", pos_info[p->pos].name);
    txt_print(3, 4, buf, PAL_WHITE);
    fmt(buf, "AGE %d", p->age);
    txt_right(26, 4, buf, PAL_WHITE);
    txt_print(3, 5, "OVERALL", PAL_GRAY);
    ovr_color_text(11, 5, player_ovr(p));
    char st[8];
    ui_stars(st, player_stars(p), 5);
    txt_print(15, 5, "POT", PAL_GRAY);
    txt_print(19, 5, st, PAL_YELLOW);
    const PosInfo *pi = &pos_info[p->pos];
    int na = p->pos == POS_K ? 2 : 4;
    for (int a = 0; a < na; a++) {
        txt_print(3, 7 + a, pi->attr[a], PAL_CYAN);
        fmt(buf, "%2d", p->attr[a]);
        txt_print(7, 7 + a, buf, PAL_WHITE);
        pnl_meter(10, 7 + a, 12, p->attr[a], 99);
    }
    pnl_box(1, 12, 28, 5);
    if (mode == CARD_FA) {
        fmt_money(money, fa_asking_salary(p));
        fmt(buf, "ASKING %s / YEAR", money);
        txt_print(3, 13, buf, PAL_YELLOW);
        txt_print(3, 14, fa_willing(p) ? "Interested in your team." : "Wants a coach with more rep.", fa_willing(p) ? PAL_GREEN : PAL_RED);
    } else if (mode == CARD_RESIGN) {
        fmt_money(money, off_resign_salary(p));
        fmt(buf, "WANTS %s x %d YRS", money, off_resign_years(p));
        txt_print(3, 13, buf, PAL_YELLOW);
        if (off_resign_refuses(p))
            txt_print(3, 14, "Unhappy: wants to test FA.", PAL_RED);
    } else if (mode == CARD_DRAFT) {
        txt_print(3, 13, "DRAFT PROSPECT", PAL_YELLOW);
        fmt_money(money, MAX(5, player_market_salary(p) * 60 / 100));
        fmt(buf, "Rookie deal ~%s x 3 YRS", money);
        txt_print(3, 14, buf, PAL_WHITE);
    } else {
        fmt_money(money, p->salary);
        fmt(buf, "SALARY %s  %d YR%s LEFT", money, p->years, p->years == 1 ? "" : "S");
        txt_print(3, 13, buf, PAL_WHITE);
    }
    if (p->injury) {
        fmt(buf, "INJURED: OUT %d WEEK%s", p->injury, p->injury == 1 ? "" : "S");
        txt_print(3, 15, buf, PAL_RED);
    } else if (mode == CARD_ROSTER) {
        fmt(buf, "TRAIN COST %d CP (HAVE %d)", train_cost(p), g_career.coachPoints);
        txt_print(3, 15, buf, PAL_GRAY);
    }
}

/* returns 1 if the roster changed */
static int player_card(int pidx, int mode)
{
    for (;;) {
        draw_player_card(pidx, mode);
        if (mode == CARD_VIEW || mode == CARD_DRAFT) {
            ui_hint("B: BACK");
            ui_wait_button();
            return 0;
        }
        if (mode == CARD_ROSTER) {
            static const char *const items[3] = {"TRAIN", "RELEASE", "BACK"};
            int r = ui_menu(18, 16, 11, items, 3, 0, 0);
            Player *p = &g_career.players[pidx];
            if (r == 0) {
                int e = train_player(pidx);
                if (e == 0) {
                    snd_play(SFX_GOOD);
                    autosave();
                    continue;
                }
                ui_message("TRAINING", e == 1 ? "Not enough coach points. Win games to earn more." :
                                       e == 2 ? "Already trained this week. Play a game first." :
                                                "This player has reached his potential.");
                continue;
            }
            if (r == 1) {
                char q[96], n[24];
                player_short_name(p, n);
                fmt(q, "Release %s? Team chemistry will drop.", n);
                if (team_count(user_team()) <= 12) {
                    ui_message("RELEASE", "You need at least 12 players on the roster.");
                    continue;
                }
                if (ui_confirm(q)) {
                    league_release(pidx);
                    autosave();
                    return 1;
                }
                continue;
            }
            return 0;
        }
        if (mode == CARD_FA) {
            static const char *const items[2] = {"SIGN", "BACK"};
            int r = ui_menu(19, 16, 10, items, 2, 0, 0);
            if (r != 0)
                return 0;
            Player *p = &g_career.players[pidx];
            if (!fa_willing(p)) {
                ui_message("NOT INTERESTED", "Raise your coaching reputation by winning to attract stars.");
                continue;
            }
            int sal = fa_asking_salary(p);
            int yrs = p->age >= 31 ? 1 : (player_ovr(p) >= 70 ? 3 : 2);
            int e = league_sign(pidx, user_team(), sal, yrs);
            if (e == 1) {
                ui_message("ROSTER FULL", "Release a player before signing another.");
                continue;
            }
            if (e == 2) {
                ui_message("NO CAP ROOM", "Not enough room under the salary cap.");
                continue;
            }
            snd_play(SFX_GOOD);
            autosave();
            return 1;
        }
        if (mode == CARD_RESIGN) {
            static const char *const items[3] = {"RE-SIGN", "LET GO", "BACK"};
            int r = ui_menu(18, 16, 11, items, 3, 0, 0);
            if (r == 0) {
                int e = off_resign(pidx);
                if (e == 0) {
                    snd_play(SFX_GOOD);
                    return 1;
                }
                ui_message("RE-SIGN", e == 2 ? "Not enough cap room for this contract." : "He refuses. Team morale is too low.");
                continue;
            }
            if (r == 1) {
                g_career.players[pidx].team = TEAM_FA;
                return 1;
            }
            return 0;
        }
    }
}

/* ------------------------------------------------------------------ */
/* roster                                                              */
/* ------------------------------------------------------------------ */

static s16 s_list[MAX_PLAYERS];
static int s_listN;
static Lineup s_lu;

static int is_starter(int pidx)
{
    for (int i = 0; i < LINEUP_SLOTS; i++)
        if (s_lu.idx[i] == pidx)
            return 1;
    return 0;
}

static void roster_row(int i, int x, int y, int sel)
{
    const Player *p = &g_career.players[s_list[i]];
    char nm[24], money[10];
    player_short_name(p, nm);
    nm[12] = 0;
    txt_print(x + 1, y, pos_info[p->pos].abbr, PAL_CYAN);
    txt_print(x + 4, y, nm, p->injury ? PAL_RED : (is_starter(s_list[i]) ? PAL_YELLOW : PAL_WHITE));
    ovr_color_text(x + 17, y, player_ovr(p));
    txt_printf(x + 20, y, PAL_GRAY, "%d", p->age);
    fmt_money(money, p->salary);
    txt_right(x + 26, y, money, PAL_WHITE);
}

static void roster_header(void)
{
    char buf[40], a[10];
    ui_screen(1);
    fmt_money(a, team_cap_room(user_team()));
    fmt(buf, "ROSTER %d/%d", team_count(user_team()), ROSTER_MAX);
    ui_title(buf, 0);
    fmt(buf, "CAP ROOM %s", a);
    txt_right(28, 0, buf, PAL_WHITE);
    list_header(3, "PAY");
    ui_hint("YELLOW=STARTER RED=INJURED");
}

static void screen_roster(void)
{
    int sel = 0, top = 0;
    for (;;) {
        s_listN = team_roster(user_team(), s_list, ROSTER_MAX + 8);
        team_lineup(user_team(), &s_lu);
        roster_header();
        pnl_box(0, 4, 30, 15);
        int r = list_run(s_listN, &sel, &top, 1, 5, 28, 13, roster_row, 0, 0);
        if (r < 0)
            return;
        player_card(s_list[r], CARD_ROSTER);
    }
}

/* ------------------------------------------------------------------ */
/* free agents                                                         */
/* ------------------------------------------------------------------ */

static void collect_team_sorted(int team)
{
    s_listN = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == team)
            s_list[s_listN++] = (s16)i;
    for (int i = 1; i < s_listN; i++) {
        s16 v = s_list[i];
        int ov = player_ovr(&g_career.players[v]);
        int j = i - 1;
        while (j >= 0 && player_ovr(&g_career.players[s_list[j]]) < ov) {
            s_list[j + 1] = s_list[j];
            j--;
        }
        s_list[j + 1] = v;
    }
}

static void fa_row(int i, int x, int y, int sel)
{
    const Player *p = &g_career.players[s_list[i]];
    char nm[24], money[10];
    player_short_name(p, nm);
    nm[12] = 0;
    txt_print(x + 1, y, pos_info[p->pos].abbr, PAL_CYAN);
    txt_print(x + 4, y, nm, fa_willing(p) ? PAL_WHITE : PAL_GRAY);
    ovr_color_text(x + 17, y, player_ovr(p));
    txt_printf(x + 20, y, PAL_GRAY, "%d", p->age);
    fmt_money(money, fa_asking_salary(p));
    txt_right(x + 26, y, money, PAL_YELLOW);
}

/* returns 1 when "done" was chosen (offseason mode) */
static int screen_free_agents(int offseason)
{
    int sel = 0, top = 0;
    for (;;) {
        collect_team_sorted(TEAM_FA);
        char buf[40], a[10];
        ui_screen(1);
        fmt_money(a, team_cap_room(user_team()));
        ui_title("FREE AGENTS", 0);
        fmt(buf, "$%s %d/%d", a, team_count(user_team()), ROSTER_MAX);
        txt_right(28, 0, buf, PAL_WHITE);
        list_header(3, "ASKS");
        pnl_box(0, 4, 30, 15);
        ui_hint(offseason ? "START:NEW SEASON SEL:ROSTER" : "A:VIEW SELECT:ROSTER B:BACK");
        u16 k = 0;
        int r = list_run(s_listN, &sel, &top, 1, 5, 28, 13, fa_row, KEY_START | KEY_SELECT, &k);
        if (r == -1) {
            if (!offseason)
                return 0;
            continue;
        }
        if (r == -2) {
            if (k & KEY_SELECT) {
                screen_roster();
                continue;
            }
            if (offseason) {
                char q[160];
                int n = team_count(user_team());
                if (n < ROSTER_MIN)
                    fmt(q, "You have %d players. Reserves will fill empty spots. Start the new season?", n);
                else
                    fmt(q, "Finish free agency and start the %d season?", g_career.year + 1);
                if (ui_confirm(q))
                    return 1;
            }
            continue;
        }
        player_card(s_list[r], CARD_FA);
    }
}

/* ------------------------------------------------------------------ */
/* standings / schedule / results                                      */
/* ------------------------------------------------------------------ */

static void screen_standings(void)
{
    int conf = team_conf(user_team());
    for (;;) {
        u8 st[TEAMS_PER_CONF];
        char buf[40];
        ui_screen(2);
        fmt(buf, "%s CONFERENCE", conf_names[conf]);
        ui_title(buf, "L/R");
        pnl_box(0, 3, 30, 13);
        txt_print(5, 4, "TEAM", PAL_GRAY);
        txt_print(16, 4, "REC", PAL_GRAY);
        txt_right(25, 4, "PF", PAL_GRAY);
        txt_right(28, 4, "PA", PAL_GRAY);
        standings_sorted(conf, st);
        for (int i = 0; i < TEAMS_PER_CONF; i++) {
            int t = st[i];
            const TeamSeason *ts = &g_career.ts[t];
            int pal = t == user_team() ? PAL_YELLOW : PAL_WHITE;
            char rec[12], nm[10];
            txt_printf(1, 5 + i, i < 4 ? PAL_GREEN : PAL_GRAY, "%d.", i + 1);
            txt_print(4, 5 + i, team_info[t].abbr, pal);
            str_copy(nm, team_info[t].name, 9);
            nm[7] = 0;
            txt_print(8, 5 + i, nm, pal);
            team_record_str(t, rec);
            txt_print(16, 5 + i, rec, pal);
            fmt(buf, "%d", ts->pf);
            txt_right(25, 5 + i, buf, pal);
            fmt(buf, "%d", ts->pa);
            txt_right(28, 5 + i, buf, pal);
        }
        txt_print(2, 14, "Top 4 make the playoffs.", PAL_GRAY);
        ui_hint("L/R: CONFERENCE  B: BACK");
        for (;;) {
            ui_frame();
            if (key_pressed & (KEY_LEFT | KEY_RIGHT | KEY_L | KEY_R)) {
                conf ^= 1;
                snd_play(SFX_MOVE);
                break;
            }
            if (key_pressed & (KEY_B | KEY_A)) {
                snd_play(SFX_BACK);
                return;
            }
        }
    }
}

static void game_line(char *buf, const GameRec *g)
{
    if (g->home == TEAM_NONE) {
        fmt(buf, "TBD");
        return;
    }
    if (g->hs == UNPLAYED)
        fmt(buf, "%s at %s", team_info[g->away].abbr, team_info[g->home].abbr);
    else
        fmt(buf, "%s %2d at %s %2d", team_info[g->away].abbr, g->as, team_info[g->home].abbr, g->hs);
}

static void show_games(const char *title, GameRec *g, int n)
{
    char buf[32];
    ui_screen(0);
    ui_title(title, 0);
    pnl_box(3, 3, 24, n + 2);
    for (int i = 0; i < n; i++) {
        game_line(buf, &g[i]);
        int user = g[i].home == user_team() || g[i].away == user_team();
        txt_print(5, 4 + i, buf, user ? PAL_YELLOW : PAL_WHITE);
        if (g[i].hs != UNPLAYED) {
            int w = g[i].hs > g[i].as ? g[i].home : g[i].away;
            if (g[i].hs != g[i].as)
                txt_put(4, 4 + i, '`', w == g[i].home ? PAL_GREEN : PAL_GREEN);
        }
    }
    ui_hint("A/B: CONTINUE");
    ui_wait_button();
}

static int s_schedWeek;

static void sched_row(int w, int x, int y, int sel)
{
    char buf[32];
    const GameRec *g = 0;
    for (int i = 0; i < GAMES_PER_WEEK; i++) {
        const GameRec *gg = &g_career.sched[w][i];
        if (gg->home == user_team() || gg->away == user_team())
            g = gg;
    }
    if (!g)
        return;
    int home = g->home == user_team();
    int opp = home ? g->away : g->home;
    fmt(buf, "WK%2d %s %s", w + 1, home ? "vs" : "at", team_info[opp].abbr);
    txt_print(x + 1, y, buf, (g_career.phase == PH_REGULAR && w == g_career.week) ? PAL_YELLOW : PAL_WHITE);
    if (g->hs != UNPLAYED) {
        int us = home ? g->hs : g->as, them = home ? g->as : g->hs;
        fmt(buf, "%c %d-%d", us > them ? 'W' : us < them ? 'L' : 'T', us, them);
        txt_print(x + 15, y, buf, us > them ? PAL_GREEN : us < them ? PAL_RED : PAL_GRAY);
    }
}

static void screen_schedule(void)
{
    int sel = g_career.phase == PH_REGULAR ? g_career.week : 0, top = 0;
    s_schedWeek = sel;
    for (;;) {
        char buf[24];
        ui_screen(2);
        fmt(buf, "%d SCHEDULE", g_career.year);
        ui_title(buf, 0);
        pnl_box(2, 3, 26, 15);
        ui_hint("A: WEEK RESULTS  B: BACK");
        int r = list_run(NUM_WEEKS, &sel, &top, 3, 4, 24, 13, sched_row, 0, 0);
        if (r < 0)
            return;
        fmt(buf, "WEEK %d", r + 1);
        show_games(buf, g_career.sched[r], GAMES_PER_WEEK);
    }
}

static void screen_bracket(void)
{
    char buf[32];
    ui_screen(3);
    fmt(buf, "%d PLAYOFFS", g_career.year);
    ui_title(buf, 0);
    pnl_box(0, 3, 30, 15);
    static const char *const rn[3] = {"DIVISIONAL", "CONFERENCE FINALS", CHAMPIONSHIP_NAME " GAME"};
    int y = 4;
    for (int r = 0; r < 3; r++) {
        txt_print(2, y++, rn[r], PAL_YELLOW);
        int f = playoff_first(r), n = playoff_count(r);
        for (int i = 0; i < n; i++) {
            game_line(buf, &g_career.playoff[f + i]);
            const GameRec *g = &g_career.playoff[f + i];
            int user = g->home == user_team() || g->away == user_team();
            txt_print(4, y++, buf, user ? PAL_CYAN : PAL_WHITE);
        }
    }
    ui_hint("B: BACK");
    ui_wait_button();
}

/* ------------------------------------------------------------------ */
/* facilities                                                          */
/* ------------------------------------------------------------------ */

static void screen_facilities(void)
{
    static const char *const names[NUM_FAC] = {"TRAINING", "REHAB", "SCOUTING", "STADIUM"};
    static const char *const desc[NUM_FAC + 1] = {
        "Faster player growth each offseason.",
        "Shorter injuries for your players.",
        "Your draft picks get more potential.",
        "Home edge, morale, cheaper free agents.",
        "Team dinner: +15 morale right now.",
    };
    int sel = 0;
    for (;;) {
        char buf[40];
        char items[NUM_FAC + 2][28];
        const char *ptrs[NUM_FAC + 2];
        ui_screen(1);
        fmt(buf, "CP %d", g_career.coachPoints);
        ui_title("FACILITIES", buf);
        for (int f = 0; f < NUM_FAC; f++) {
            if (g_career.fac[f] >= MAX_FAC_LEVEL)
                fmt(items[f], "%-9s LV%d  MAX", names[f], g_career.fac[f]);
            else
                fmt(items[f], "%-9s LV%d  %dCP", names[f], g_career.fac[f], facility_cost(f));
            ptrs[f] = items[f];
        }
        fmt(items[NUM_FAC], "TEAM DINNER     4CP");
        fmt(items[NUM_FAC + 1], "BACK");
        ptrs[NUM_FAC] = items[NUM_FAC];
        ptrs[NUM_FAC + 1] = items[NUM_FAC + 1];
        const TeamSeason *ts = &g_career.ts[user_team()];
        fmt(buf, "MORALE %d  CHEMISTRY %d", ts->morale, ts->chem);
        txt_print(2, 3, buf, PAL_WHITE);
        txt_print(2, 13, "Earn coach points (CP) by", PAL_GRAY);
        txt_print(2, 14, "winning games and playoffs.", PAL_GRAY);
        txt_print(2, 16, desc[MIN(sel, NUM_FAC)], PAL_CYAN);
        int r = ui_menu(2, 5, 26, ptrs, NUM_FAC + 2, sel, 0);
        if (r < 0 || r == NUM_FAC + 1)
            return;
        sel = r;
        if (r == NUM_FAC) {
            if (g_career.coachPoints < 4) {
                ui_message("TEAM DINNER", "Not enough coach points.");
                continue;
            }
            g_career.coachPoints -= 4;
            TeamSeason *t = &g_career.ts[user_team()];
            t->morale = (u8)MIN(99, t->morale + 15);
            snd_play(SFX_GOOD);
            autosave();
            continue;
        }
        if (g_career.fac[r] >= MAX_FAC_LEVEL) {
            ui_message(names[r], "Already at the maximum level.");
            continue;
        }
        int cost = facility_cost(r);
        if (g_career.coachPoints < cost) {
            ui_message(names[r], "Not enough coach points.");
            continue;
        }
        g_career.coachPoints -= (u16)cost;
        g_career.fac[r]++;
        snd_play(SFX_GOOD);
        autosave();
    }
}

/* ------------------------------------------------------------------ */
/* coach & history                                                     */
/* ------------------------------------------------------------------ */

static void hist_row(int i, int x, int y, int sel)
{
    const HistEntry *h = &g_career.hist[g_career.numHist - 1 - i];
    char buf[32];
    fmt(buf, "%d %s %d-%d", h->year, team_info[h->champ].abbr, h->userW, h->userL);
    txt_print(x + 1, y, buf, h->champ == user_team() ? PAL_YELLOW : PAL_WHITE);
    txt_print(x + 15, y, finish_name(h->userFinish), h->userFinish == FIN_CHAMP ? PAL_YELLOW : PAL_GRAY);
}

static void screen_coach(void)
{
    char buf[40];
    ui_screen(3);
    fmt(buf, "COACH %s", g_career.coachName);
    ui_title(buf, 0);
    pnl_box(0, 3, 30, 7);
    fmt(buf, "SEASONS %d   REPUTATION %d", g_career.seasonNum, g_career.reputation);
    txt_print(2, 4, buf, PAL_WHITE);
    fmt(buf, "RECORD %d-%d-%d", g_career.careerW, g_career.careerL, g_career.careerT);
    txt_print(2, 5, buf, PAL_WHITE);
    fmt(buf, "PLAYOFFS %d-%d  APPEARANCES %d", g_career.playoffW, g_career.playoffL, g_career.playoffApps);
    txt_print(2, 6, buf, PAL_WHITE);
    fmt(buf, "TITLES %d   BEST SEASON %d WINS", g_career.titles, g_career.bestWins);
    txt_print(2, 7, buf, g_career.titles ? PAL_YELLOW : PAL_WHITE);
    fmt(buf, "PASS YDS %d  RUSH YDS %d", (int)g_career.careerPassYds, (int)g_career.careerRushYds);
    txt_print(2, 8, buf, PAL_GRAY);
    txt_print(1, 10, "YEAR CHAMP  YOU   FINISH", PAL_GRAY);
    pnl_box(0, 11, 30, 8);
    if (g_career.numHist == 0) {
        txt_print(2, 13, "No completed seasons yet.", PAL_GRAY);
        ui_hint("B: BACK");
        ui_wait_button();
        return;
    }
    int sel = 0, top = 0;
    ui_hint("PAST " CHAMPIONSHIP_NAME " WINNERS  B: BACK");
    list_run(g_career.numHist, &sel, &top, 1, 12, 28, 6, hist_row, 0, 0);
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

static void screen_settings(void)
{
    static const char *const dn[3] = {"ROOKIE", "PRO", "LEGEND"};
    int sel = 0;
    for (;;) {
        char it[4][28];
        const char *p[4];
        ui_screen(0);
        ui_title("SETTINGS", 0);
        fmt(it[0], "QUARTER LENGTH  %d MIN", g_career.quarterMin);
        fmt(it[1], "SOUND           %s", g_career.soundOn ? "ON" : "OFF");
        fmt(it[2], "DIFFICULTY      %s", dn[g_career.difficulty]);
        fmt(it[3], "BACK");
        for (int i = 0; i < 4; i++)
            p[i] = it[i];
        ui_paragraph(2, 12, 26, "Difficulty sets how smart the defense is and how well the CPU offense moves the ball.", PAL_GRAY);
        int r = ui_menu(2, 4, 26, p, 4, sel, 0);
        if (r < 0 || r == 3)
            break;
        sel = r;
        if (r == 0)
            g_career.quarterMin = (u8)(g_career.quarterMin >= 6 ? 3 : g_career.quarterMin + 1);
        if (r == 1) {
            g_career.soundOn ^= 1;
            snd_set_enabled(g_career.soundOn);
            if (g_career.soundOn)
                music_play(MUS_HUB);
        }
        if (r == 2)
            g_career.difficulty = (u8)((g_career.difficulty + 1) % 3);
    }
    autosave();
}

/* ------------------------------------------------------------------ */
/* champion celebration                                                */
/* ------------------------------------------------------------------ */

static void screen_champion(void)
{
    int champ = playoff_winner(&g_career.playoff[6]);
    int user = champ == user_team();
    char buf[40];
    ui_screen(user ? 1 : 0);
    music_play(user ? MUS_CHAMPION : MUS_VICTORY);
    fmt(buf, "%d %s", g_career.year, CHAMPIONSHIP_NAME);
    ui_title(buf, 0);
    team_name(buf, champ);
    txt_center(13, user ? "YOUR TEAM ARE CHAMPIONS!" : "CHAMPIONS", PAL_YELLOW);
    txt_center(14, buf, PAL_WHITE);
    game_line(buf, &g_career.playoff[6]);
    txt_center(16, buf, PAL_GRAY);
    ui_hint("A: CONTINUE");
    for (int f = 0;; f++) {
        oam_begin();
        oam_add(104, 40 + ((f >> 4) & 1), OT_TROPHY, SPR_32x32, OPAL_MISC, 0, 0);
        ui_crest(80, 56, champ, OPAL_CREST);
        ui_crest(144, 56, champ, OPAL_CREST);
        if (user && (f % 40) == 0)
            snd_play(SFX_CROWD);
        ui_frame();
        if (f > 30 && (key_pressed & (KEY_A | KEY_START)))
            break;
    }
    oam_begin();
    snd_play(SFX_OK);
}

/* ------------------------------------------------------------------ */
/* offseason                                                           */
/* ------------------------------------------------------------------ */

static void off_recap(void)
{
    const HistEntry *h = &g_career.hist[g_career.numHist - 1];
    char buf[40];
    ui_screen(3);
    fmt(buf, "%d SEASON RECAP", h->year);
    ui_title(buf, 0);
    pnl_box(1, 3, 28, 13);
    team_name(buf, h->champ);
    txt_print(3, 4, CHAMPIONSHIP_NAME " CHAMPION", PAL_GRAY);
    txt_print(3, 5, buf, PAL_YELLOW);
    fmt(buf, "YOUR RECORD %d-%d-%d", h->userW, h->userL, h->userT);
    txt_print(3, 7, buf, PAL_WHITE);
    txt_print(3, 8, finish_name(h->userFinish), h->userFinish == FIN_CHAMP ? PAL_YELLOW : PAL_WHITE);
    const SeasonStats *s = &g_career.stats;
    fmt(buf, "PASS %d  RUSH %d YDS", s->passYds, s->rushYds);
    txt_print(3, 10, buf, PAL_GRAY);
    fmt(buf, "TD %d  INT %d  FG %d/%d", s->passTD + s->rushTD, s->ints, s->fgMade, s->fgAtt);
    txt_print(3, 11, buf, PAL_GRAY);
    fmt(buf, "REPUTATION %d   CP %d", g_career.reputation, g_career.coachPoints);
    txt_print(3, 13, buf, PAL_CYAN);
    txt_print(3, 14, "Next: aging & contracts", PAL_GRAY);
    ui_hint("A: CONTINUE");
    ui_wait_button();
}

static void change_row(int i, int x, int y, int sel)
{
    const ChangeInfo *c = &off_changes[i];
    char buf[32];
    fmt(buf, "%s %c. %s", pos_info[c->pos].abbr, first_names[c->first][0], last_names[c->last]);
    buf[17] = 0;
    txt_print(x + 1, y, buf, PAL_WHITE);
    if (c->retired) {
        txt_print(x + 19, y, "RETIRED", PAL_RED);
        return;
    }
    int d = c->newOvr - c->oldOvr;
    fmt(buf, "%d", c->newOvr);
    txt_print(x + 19, y, buf, PAL_WHITE);
    if (d) {
        fmt(buf, "%c%d", d > 0 ? '+' : '-', ABS(d));
        txt_print(x + 22, y, buf, d > 0 ? PAL_GREEN : PAL_RED);
    }
    const Player *p = &g_career.players[c->idx];
    if (p->team == user_team() && p->years == 0)
        txt_print(x + 25, y, "EXP", PAL_ORANGE);
}

static void off_progress_screen(void)
{
    char buf[40];
    ui_screen(1);
    ui_title("PLAYER DEVELOPMENT", 0);
    fmt(buf, "%d RETIRED LEAGUE-WIDE", off_league_retired);
    txt_print(1, 3, buf, PAL_GRAY);
    pnl_box(0, 4, 30, 15);
    ui_hint("EXP=CONTRACT EXPIRED B:DONE");
    if (off_num_changes == 0) {
        txt_print(2, 6, "No changes on your roster.", PAL_GRAY);
        ui_wait_button();
        return;
    }
    int sel = 0, top = 0;
    while (list_run(off_num_changes, &sel, &top, 1, 5, 28, 13, change_row, 0, 0) >= 0) {
    }
}

static void resign_row(int i, int x, int y, int sel)
{
    const Player *p = &g_career.players[s_list[i]];
    char nm[24], money[10];
    player_short_name(p, nm);
    nm[12] = 0;
    txt_print(x + 1, y, pos_info[p->pos].abbr, PAL_CYAN);
    txt_print(x + 4, y, nm, off_resign_refuses(p) ? PAL_RED : PAL_WHITE);
    ovr_color_text(x + 17, y, player_ovr(p));
    txt_printf(x + 20, y, PAL_GRAY, "%d", p->age);
    fmt_money(money, off_resign_salary(p));
    txt_right(x + 26, y, money, PAL_YELLOW);
}

static void off_resign_screen(void)
{
    int sel = 0, top = 0;
    for (;;) {
        s_listN = 0;
        for (int i = 0; i < MAX_PLAYERS; i++)
            if (g_career.players[i].team == user_team() && g_career.players[i].years == 0)
                s_list[s_listN++] = (s16)i;
        if (s_listN == 0) {
            ui_screen(1);
            ui_title("RE-SIGN PLAYERS", 0);
            ui_message("CONTRACTS", "No expiring contracts to handle.");
            break;
        }
        char buf[80], a[10];
        ui_screen(1);
        ui_title("EXPIRING CONTRACTS", 0);
        int pay = 0;
        for (int i = 0; i < MAX_PLAYERS; i++)
            if (g_career.players[i].team == user_team() && g_career.players[i].years > 0)
                pay += g_career.players[i].salary;
        fmt_money(a, SALARY_CAP - pay);
        fmt(buf, "ROOM %s", a);
        txt_right(28, 0, buf, PAL_WHITE);
        list_header(3, "ASKS");
        pnl_box(0, 4, 30, 15);
        ui_hint("A: DECIDE  START: DONE");
        u16 k;
        int r = list_run(s_listN, &sel, &top, 1, 5, 28, 13, resign_row, KEY_START, &k);
        if (r == -2 || r == -1) {
            fmt(buf, "Unsigned players (%d) will leave. Continue?", s_listN);
            if (ui_confirm(buf))
                break;
            continue;
        }
        player_card(s_list[r], CARD_RESIGN);
    }
    off_resign_finish();
    autosave();
}

static void prospect_row(int i, int x, int y, int sel)
{
    const Player *p = &g_career.players[s_list[i]];
    char nm[24], st[8];
    player_short_name(p, nm);
    nm[12] = 0;
    txt_print(x + 1, y, pos_info[p->pos].abbr, PAL_CYAN);
    txt_print(x + 4, y, nm, PAL_WHITE);
    ovr_color_text(x + 17, y, player_ovr(p));
    txt_printf(x + 20, y, PAL_GRAY, "%d", p->age);
    ui_stars(st, player_stars(p), 5);
    txt_print(x + 22, y, st, PAL_YELLOW);
}

static void collect_prospects(void)
{
    s_listN = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == TEAM_DRAFT)
            s_list[s_listN++] = (s16)i;
    for (int i = 1; i < s_listN; i++) {
        s16 v = s_list[i];
        const Player *pv = &g_career.players[v];
        int kv = player_ovr(pv) + pv->pot * 2;
        int j = i - 1;
        while (j >= 0) {
            const Player *pj = &g_career.players[s_list[j]];
            if (player_ovr(pj) + pj->pot * 2 >= kv)
                break;
            s_list[j + 1] = s_list[j];
            j--;
        }
        s_list[j + 1] = v;
    }
}

static void off_draft_screen(void)
{
    int anyProspect = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == TEAM_DRAFT)
            anyProspect = 1;
    if (!anyProspect && g_career.draftPick == 0)
        off_draft_begin();
    char buf[48];
    char last[8][32];
    int nlast = 0;
    memset(last, 0, sizeof(last));
    while (off_draft_team() >= 0) {
        int team = off_draft_team();
        int pickNo = g_career.draftPick % NUM_TEAMS + 1;
        if (team != user_team()) {
            int before = g_career.draftPick;
            /* remember who was available, then AI picks */
            off_draft_ai_pick();
            int got = -1;
            for (int i = 0; i < MAX_PLAYERS; i++) {
                const Player *p = &g_career.players[i];
                if (p->team == team && (p->flags & PF_ROOKIE) && p->age <= 23 && p->years == 3)
                    got = i;
            }
            if (g_career.draftPick != before && got >= 0) {
                const Player *p = &g_career.players[got];
                char nm[24];
                player_short_name(p, nm);
                fmt(buf, "R%d.%02d %s %s %s", off_draft_round(), pickNo, team_info[team].abbr, pos_info[p->pos].abbr, nm);
                buf[29] = 0;
                if (nlast == 8) {
                    memmove(last[0], last[1], sizeof(last[0]) * 7);
                    nlast = 7;
                }
                str_copy(last[nlast++], buf, 32);
            }
            ui_screen(2);
            ui_title("DRAFT", "B: FAST");
            pnl_box(0, 3, 30, 12);
            for (int i = 0; i < nlast; i++)
                txt_print(1, 4 + i, last[i], PAL_WHITE);
            int next = off_draft_team();
            if (next >= 0) {
                fmt(buf, "ON THE CLOCK: %s", team_info[next].abbr);
                txt_print(1, 16, buf, next == user_team() ? PAL_YELLOW : PAL_GRAY);
            }
            for (int f = 0; f < 18; f++) {
                ui_frame();
                if (key_held & KEY_B)
                    break;
            }
            continue;
        }
        /* user's pick */
        collect_prospects();
        int sel = 0, top = 0;
        for (;;) {
            ui_screen(1);
            fmt(buf, "ROUND %d PICK %d - YOUR PICK", off_draft_round(), pickNo);
            ui_title(buf, 0);
            list_header(3, "POT");
            pnl_box(0, 4, 30, 15);
            ui_hint("A:VIEW SEL:ROSTER START:SKIP");
            u16 k;
            int r = list_run(s_listN, &sel, &top, 1, 5, 28, 13, prospect_row, KEY_START | KEY_SELECT, &k);
            if (r == -2 && (k & KEY_SELECT)) {
                screen_roster();
                continue;
            }
            if (r == -2) {
                if (ui_confirm("Skip this pick?")) {
                    g_career.draftPick++;
                    break;
                }
                continue;
            }
            if (r < 0)
                continue;
            draw_player_card(s_list[r], CARD_DRAFT);
            static const char *const items[2] = {"DRAFT HIM", "BACK"};
            int c = ui_menu(18, 16, 11, items, 2, 0, 0);
            if (c != 0)
                continue;
            int e = off_draft_pick(s_list[r]);
            if (e == 1) {
                ui_message("ROSTER FULL", "Release a player (SELECT: roster) or skip the pick (START).");
                continue;
            }
            snd_play(SFX_GOOD);
            const Player *p = &g_career.players[s_list[r]];
            char nm[24];
            player_short_name(p, nm);
            fmt(buf, "R%d.%02d %s %s %s", off_draft_round(), pickNo, team_info[team].abbr, pos_info[p->pos].abbr, nm);
            buf[29] = 0;
            if (nlast == 8) {
                memmove(last[0], last[1], sizeof(last[0]) * 7);
                nlast = 7;
            }
            str_copy(last[nlast++], buf, 32);
            break;
        }
    }
    off_draft_finish();
    off_fa_ai();
    autosave();
    ui_screen(2);
    ui_title("DRAFT COMPLETE", 0);
    ui_message("FREE AGENCY", "The draft is over. Sign free agents to fill your roster, then press START to begin the new season.");
}

static void offseason_flow(void)
{
    music_play(MUS_HUB);
    if (g_career.offStage == OFF_RECAP) {
        off_recap();
        off_progress();
        autosave();
        off_progress_screen();
    }
    if (g_career.offStage == OFF_PROGRESS) {
        off_progress();
        autosave();
    }
    if (g_career.offStage == OFF_RESIGN)
        off_resign_screen();
    if (g_career.offStage == OFF_DRAFT)
        off_draft_screen();
    if (g_career.offStage == OFF_FREEAGENCY) {
        if (screen_free_agents(1)) {
            off_new_season();
            autosave();
            char buf[128];
            fmt(buf, "Welcome to the %d season! Your record resets and a new schedule awaits.", g_career.year);
            ui_screen(0);
            ui_message("NEW SEASON", buf);
        }
    }
}

/* ------------------------------------------------------------------ */
/* game day                                                            */
/* ------------------------------------------------------------------ */

static void apply_user_stats(const MatchResult *r)
{
    SeasonStats *s = &g_career.stats;
    s->passYds += r->passYds;
    s->rushYds += r->rushYds;
    s->passTD += r->passTD;
    s->rushTD += r->rushTD;
    s->ints += r->ints;
    s->fumbles += r->fumbles;
    s->sacksAllowed += r->sacks;
    s->fgMade += r->fgm;
    s->fgAtt += r->fga;
    g_career.careerPassYds += r->passYds;
    g_career.careerRushYds += r->rushYds;
    g_career.careerTDs += (u16)(r->passTD + r->rushTD);
}

static void after_week(void)
{
    int wasPhase = g_career.phase;
    GameRec *g;
    char buf[32];
    int n = season_games_this_week(&g);
    season_week_label(buf);
    show_games(buf, g, n);
    season_advance();
    autosave();
    if (wasPhase == PH_REGULAR && g_career.phase == PH_PLAYOFFS) {
        int seed = user_seed();
        ui_screen(3);
        ui_title("REGULAR SEASON OVER", 0);
        if (seed) {
            fmt(buf, "You are the #%d seed!", seed);
            ui_message("PLAYOFFS!", buf);
        } else {
            ui_message("SEASON OVER", "You missed the playoffs. The postseason will be simulated.");
        }
        screen_bracket();
    } else if (wasPhase == PH_PLAYOFFS && g_career.phase == PH_OFFSEASON) {
        screen_champion();
    }
}

static void pregame(void)
{
    GameRec *g = season_user_game();
    if (!g) {
        /* eliminated: simulate this round */
        season_sim_others();
        after_week();
        return;
    }
    int home = g->home, away = g->away;
    int opp = home == user_team() ? away : home;
    char buf[40], wk[24];
    for (;;) {
        ui_screen(2);
        season_week_label(wk);
        ui_title(wk, 0);
        pnl_box(1, 3, 28, 10);
        for (int s = 0; s < 2; s++) {
            int t = s == 0 ? away : home;
            int x = s == 0 ? 3 : 16;
            txt_print(x, 9, team_info[t].abbr, t == user_team() ? PAL_YELLOW : PAL_WHITE);
            char rec[12];
            team_record_str(t, rec);
            txt_print(x, 10, rec, PAL_GRAY);
            fmt(buf, "OFF %d", team_off_ovr(t));
            txt_print(x + 5, 9, buf, PAL_WHITE);
            fmt(buf, "DEF %d", team_def_ovr(t));
            txt_print(x + 5, 10, buf, PAL_WHITE);
        }
        txt_center(5, "AT", PAL_GRAY);
        team_name(buf, home);
        txt_center(11, buf, PAL_CYAN);
        txt_print(3, 4, "AWAY", PAL_GRAY);
        txt_print(23, 4, "HOME", PAL_GRAY);
        oam_begin();
        ui_crest(40, 48, away, OPAL_CREST);
        ui_crest(184, 48, home, OPAL_CREST + 1);
        static const char *const items[3] = {"PLAY GAME", "SIMULATE", "BACK"};
        int r = ui_menu(8, 14, 14, items, 3, 0, 0);
        oam_begin();
        if (r < 0 || r == 2)
            return;
        if (r == 1) {
            if (!ui_confirm("Simulate this game? You won't control the offense."))
                continue;
            int us = home == user_team();
            season_sim_user();
            GameRec *gg = season_user_game();
            (void)gg;
            int hs = g->hs, as = g->as;
            int win = us ? hs > as : as > hs;
            fmt(buf, "%s %d - %s %d", team_info[away].abbr, as, team_info[home].abbr, hs);
            ui_screen(0);
            ui_message(win ? "SIMULATED: WIN" : (hs == as ? "SIMULATED: TIE" : "SIMULATED: LOSS"), buf);
            season_sim_others();
            after_week();
            return;
        }
        break;
    }
    MatchResult mr;
    int flags = g_career.phase == PH_PLAYOFFS ? MF_PLAYOFF : 0;
    gfx_fade_out();
    match_play(home, away, user_team(), flags, &mr);
    int hs = home == user_team() ? mr.userScore : mr.oppScore;
    int as = home == user_team() ? mr.oppScore : mr.userScore;
    (void)opp;
    if (mr.simulated != 2) {
        season_record(g, hs, as, 0);
        apply_user_stats(&mr);
    }
    /* playoff games can't end tied */
    music_play(MUS_HUB);
    season_sim_others();
    after_week();
}

/* ------------------------------------------------------------------ */
/* the hub                                                             */
/* ------------------------------------------------------------------ */

static void draw_hub(void)
{
    char buf[40], wk[24], rec[12], m[10];
    int u = user_team();
    ui_screen(0);
    season_week_label(wk);
    fmt(buf, "%s  %d", wk, g_career.year);
    ui_title(buf, 0);
    fmt(buf, "CP %d", g_career.coachPoints);
    txt_right(28, 0, buf, PAL_CYAN);
    pnl_box(0, 3, 30, 8);
    pal_team_bg(PAL_TEAMTXT, u, 0);
    fmt(buf, "%s %s", team_info[u].city, team_info[u].name);
    txt_print(2, 4, buf, PAL_TEAMTXT);
    team_record_str(u, rec);
    u8 st[8];
    standings_sorted(team_conf(u), st);
    int place = 1;
    for (int i = 0; i < 8; i++)
        if (st[i] == u)
            place = i + 1;
    int off = team_off_ovr(u), def = team_def_ovr(u);
    fmt(buf, "%s  #%d %s   OVR %d", rec, place, conf_names[team_conf(u)], (off * 11 + def * 9) / 20);
    txt_print(2, 5, buf, PAL_WHITE);
    const TeamSeason *ts = &g_career.ts[u];
    fmt(buf, "OFF %d DEF %d MOR %d CHM %d", off, def, ts->morale, ts->chem);
    txt_print(2, 6, buf, PAL_GRAY);
    fmt_money(m, team_cap_room(u));
    fmt(buf, "REP %d  CAP ROOM %s", g_career.reputation, m);
    txt_print(2, 7, buf, PAL_GRAY);
    GameRec *g = season_user_game();
    if (g && g->hs == UNPLAYED) {
        int home = g->home == u;
        int opp = home ? g->away : g->home;
        char orec[12];
        team_record_str(opp, orec);
        fmt(buf, "NEXT: %s %s (%s)  OVR %d", home ? "vs" : "at", team_info[opp].abbr, orec, team_ovr(opp));
        txt_print(2, 9, buf, PAL_YELLOW);
    } else if (g_career.phase == PH_PLAYOFFS) {
        txt_print(2, 9, "ELIMINATED - SIM PLAYOFFS", PAL_RED);
    }
    ui_crest(216, 30, u, OPAL_CREST);
}

void screen_career(void)
{
    music_play(MUS_HUB);
    snd_set_enabled(g_career.soundOn);
    int sel = 0;
    for (;;) {
        if (g_career.phase == PH_OFFSEASON) {
            offseason_flow();
            continue;
        }
        draw_hub();
        GameRec *g = season_user_game();
        static const char *items[10];
        items[0] = g ? "PLAY GAME" : "SIM ROUND";
        items[1] = "ROSTER";
        items[2] = "FREE AGENTS";
        items[3] = "STANDINGS";
        items[4] = g_career.phase == PH_PLAYOFFS ? "BRACKET" : "SCHEDULE";
        items[5] = "FACILITIES";
        items[6] = "COACH/HISTORY";
        items[7] = "HOW TO PLAY";
        items[8] = "SETTINGS";
        items[9] = "SAVE & EXIT";
        ui_hint("A: SELECT  D-PAD: MOVE");
        int r = ui_grid_menu(0, 11, 2, 14, items, 10, sel);
        if (r < 0)
            continue;
        sel = r;
        switch (r) {
        case 0: pregame(); music_play(MUS_HUB); break;
        case 1: screen_roster(); break;
        case 2: screen_free_agents(0); break;
        case 3: screen_standings(); break;
        case 4:
            if (g_career.phase == PH_PLAYOFFS)
                screen_bracket();
            else
                screen_schedule();
            break;
        case 5: screen_facilities(); break;
        case 6: screen_coach(); break;
        case 7: show_controls(); break;
        case 8: screen_settings(); break;
        case 9:
            autosave();
            ui_message("SAVED", "Your career is saved. See you next time, coach!");
            return;
        }
    }
}

/* ------------------------------------------------------------------ */
/* new career                                                          */
/* ------------------------------------------------------------------ */

static int pick_team(const char *title, int start, int exclude)
{
    int t = start;
    char buf[40];
    for (;;) {
        ui_screen(1);
        ui_title(title, "L/R");
        pnl_box(2, 3, 26, 13);
        pal_team_bg(PAL_TEAMTXT, t, 0);
        txt_center(4, team_info[t].city, PAL_TEAMTXT);
        txt_center(5, team_info[t].name, PAL_WHITE);
        fmt(buf, "%s CONFERENCE", conf_names[team_conf(t)]);
        txt_center(7, buf, PAL_GRAY);
        fmt(buf, "OVERALL %d", team_ovr(t));
        txt_center(9, buf, PAL_YELLOW);
        fmt(buf, "OFFENSE %d  DEFENSE %d", team_off_ovr(t), team_def_ovr(t));
        txt_center(10, buf, PAL_WHITE);
        char m[10];
        fmt_money(m, team_cap_room(t));
        fmt(buf, "CAP ROOM %s", m);
        txt_center(11, buf, PAL_WHITE);
        /* best player */
        Lineup lu;
        team_lineup(t, &lu);
        if (lu.idx[SL_QB] >= 0) {
            const Player *p = &g_career.players[lu.idx[SL_QB]];
            char nm[24];
            player_short_name(p, nm);
            fmt(buf, "QB %s (%d)", nm, player_ovr(p));
            txt_center(13, buf, PAL_CYAN);
        }
        fmt(buf, "TEAM %d OF %d", t + 1, NUM_TEAMS);
        txt_center(14, buf, PAL_GRAY);
        ui_hint(exclude >= 0 ? "A: SELECT  B: BACK" : "A: SELECT  LEFT/RIGHT: BROWSE");
        for (;;) {
            oam_begin();
            ui_crest(32, 34, t, OPAL_CREST);
            ui_crest(192, 34, t, OPAL_CREST);
            ui_frame();
            if (key_repeat & (KEY_RIGHT | KEY_R | KEY_DOWN)) {
                do {
                    t = (t + 1) % NUM_TEAMS;
                } while (t == exclude);
                snd_play(SFX_MOVE);
                break;
            }
            if (key_repeat & (KEY_LEFT | KEY_L | KEY_UP)) {
                do {
                    t = (t + NUM_TEAMS - 1) % NUM_TEAMS;
                } while (t == exclude);
                snd_play(SFX_MOVE);
                break;
            }
            if (key_pressed & KEY_A) {
                snd_play(SFX_OK);
                oam_begin();
                return t;
            }
            if (key_pressed & KEY_B) {
                snd_play(SFX_BACK);
                oam_begin();
                return -1;
            }
        }
    }
}

int screen_new_career(void)
{
    if (s_hasSave) {
        ui_screen(2);
        ui_title("NEW CAREER", 0);
        if (!ui_confirm("This will ERASE your saved career. Are you sure?"))
            return 0;
        if (!ui_confirm("Really erase it? This cannot be undone."))
            return 0;
    }
    char name[12] = "";
    if (ui_text_entry("COACH NAME", name, 10) == 0)
        str_copy(name, "COACH", sizeof(name));
    u32 seed = g_frame * 2654435761u ^ (u32)REG_VCOUNT ^ 0xA5A5u;
    league_new(0, DIFF_PRO, name, seed);
    int t = pick_team("CHOOSE YOUR TEAM", rng_range(NUM_TEAMS), -1);
    if (t < 0)
        return 0;
    g_career.userTeam = (u8)t;
    static const char *const dn[3] = {"ROOKIE", "PRO", "LEGEND"};
    ui_screen(0);
    ui_title("DIFFICULTY", 0);
    txt_print(2, 10, "ROOKIE: forgiving defenses.", PAL_GRAY);
    txt_print(2, 11, "PRO: a fair fight.", PAL_GRAY);
    txt_print(2, 12, "LEGEND: smart, hard-hitting", PAL_GRAY);
    txt_print(2, 13, "defenses, tough opponents.", PAL_GRAY);
    int d = ui_menu(8, 4, 14, dn, 3, 1, 0);
    if (d < 0)
        d = 1;
    g_career.difficulty = (u8)d;
    autosave();
    char buf[200];
    fmt(buf, "Welcome, Coach %s! The %s %s need a winner. Win games to earn coach points and reputation.", name,
        team_info[t].city, team_info[t].name);
    ui_screen(1);
    ui_message("NEW CAREER", buf);
    return 1;
}

/* ------------------------------------------------------------------ */
/* quick game                                                          */
/* ------------------------------------------------------------------ */

/* Exhibition: a one-off game for practice and quick tests. Never saved. */
static u8 s_exTeam = 0, s_exOpp = 1, s_exAway = 0, s_exQtr = 2, s_exDiff = DIFF_PRO;

static void exhibition_draw(int sel)
{
    static const char *const dn[3] = {"ROOKIE", "PRO", "LEGEND"};
    static const char *const labels[7] = {"YOUR TEAM", "OPPONENT", "VENUE", "QUARTERS", "DIFFICULTY",
                                          "START GAME", "BACK"};
    char val[32];
    ui_screen(1);
    ui_title("EXHIBITION", "NOT SAVED");
    pnl_box(0, 3, 30, 11);
    for (int i = 0; i < 7; i++) {
        int y = 4 + i + (i >= 5 ? 1 : 0);
        pnl_fill(1, y, 28, 1, i == sel ? T_HILITE : T_FILL);
        if (i == sel)
            txt_put(1, y, '`', PAL_YELLOW);
        txt_print(2, y, labels[i], i == sel ? PAL_YELLOW : (i >= 5 ? PAL_CYAN : PAL_WHITE));
        val[0] = 0;
        switch (i) {
        case 0: fmt(val, "%s %s", team_info[s_exTeam].abbr, team_info[s_exTeam].name); break;
        case 1: fmt(val, "%s %s", team_info[s_exOpp].abbr, team_info[s_exOpp].name); break;
        case 2: fmt(val, "%s", s_exAway ? "AWAY" : "HOME"); break;
        case 3: fmt(val, "%d MIN", s_exQtr); break;
        case 4: fmt(val, "%s", dn[s_exDiff]); break;
        }
        if (val[0]) {
            val[15] = 0;
            txt_print(13, y, val, PAL_WHITE);
            if (i == sel)
                txt_put(12, y, DEL_CHAR, PAL_GRAY);
        }
    }
    fmt(val, "OVR %d vs %d", team_ovr(s_exTeam), team_ovr(s_exOpp));
    txt_print(2, 15, val, PAL_GRAY);
    txt_print(2, 16, "Short quarters = fast tests.", PAL_GRAY);
    ui_hint("L/R: CHANGE  A: SELECT");
    oam_begin();
    ui_crest(200, 116, s_exTeam, OPAL_CREST);
    ui_crest(222, 116, s_exOpp, OPAL_CREST + 1);
}

void screen_quick_game(void)
{
    if (!(s_hasSave && save_load()))
        league_new(0, DIFF_PRO, "COACH", g_frame * 747796405u + 1);
    if (s_exOpp == s_exTeam)
        s_exOpp = (u8)((s_exTeam + 1) % NUM_TEAMS);
    int sel = 5;
    for (;;) {
        exhibition_draw(sel);
        int go = 0;
        for (;;) {
            ui_frame();
            int old = sel, changed = 0;
            if (key_repeat & KEY_DOWN) sel = (sel + 1) % 7;
            if (key_repeat & KEY_UP) sel = (sel + 6) % 7;
            int d = (key_repeat & KEY_RIGHT) ? 1 : (key_repeat & KEY_LEFT) ? -1 : 0;
            if (d) {
                changed = 1;
                switch (sel) {
                case 0:
                    do s_exTeam = (u8)((s_exTeam + NUM_TEAMS + d) % NUM_TEAMS); while (s_exTeam == s_exOpp);
                    break;
                case 1:
                    do s_exOpp = (u8)((s_exOpp + NUM_TEAMS + d) % NUM_TEAMS); while (s_exOpp == s_exTeam);
                    break;
                case 2: s_exAway ^= 1; break;
                case 3: s_exQtr = (u8)(1 + (s_exQtr - 1 + 6 + d) % 6); break;
                case 4: s_exDiff = (u8)((s_exDiff + 3 + d) % 3); break;
                default: changed = 0; break;
                }
            }
            if (sel != old || changed) {
                snd_play(SFX_MOVE);
                break;
            }
            if (key_pressed & KEY_B) {
                snd_play(SFX_BACK);
                if (s_hasSave)
                    save_load();
                return;
            }
            if (key_pressed & KEY_A) {
                snd_play(SFX_OK);
                if (sel == 6) {
                    if (s_hasSave)
                        save_load();
                    return;
                }
                if (sel == 0 || sel == 1) {
                    int t = pick_team(sel == 0 ? "EXHIBITION: YOUR TEAM" : "EXHIBITION: OPPONENT",
                                      sel == 0 ? s_exTeam : s_exOpp, sel == 0 ? s_exOpp : s_exTeam);
                    if (t >= 0) {
                        if (sel == 0)
                            s_exTeam = (u8)t;
                        else
                            s_exOpp = (u8)t;
                    }
                    break;
                }
                if (sel == 5) {
                    go = 1;
                    break;
                }
                /* A on a value row also changes it */
                if (sel == 2) s_exAway ^= 1;
                if (sel == 3) s_exQtr = (u8)(s_exQtr % 6 + 1);
                if (sel == 4) s_exDiff = (u8)((s_exDiff + 1) % 3);
                break;
            }
        }
        if (!go)
            continue;
        /* play (and replay) */
        for (;;) {
            u8 keepQ = g_career.quarterMin, keepD = g_career.difficulty;
            g_career.quarterMin = s_exQtr;
            g_career.difficulty = s_exDiff;
            int home = s_exAway ? s_exOpp : s_exTeam, away = s_exAway ? s_exTeam : s_exOpp;
            MatchResult mr;
            gfx_fade_out();
            match_play(home, away, s_exTeam, MF_EXHIBITION, &mr);
            g_career.quarterMin = keepQ;
            g_career.difficulty = keepD;
            music_play(MUS_TITLE);
            ui_screen(0);
            ui_title("EXHIBITION OVER", 0);
            char buf[40];
            fmt(buf, "%s %d - %s %d", team_info[s_exTeam].abbr, mr.userScore, team_info[s_exOpp].abbr, mr.oppScore);
            txt_center(5, buf, PAL_YELLOW);
            static const char *const after[3] = {"REMATCH", "CHANGE SETUP", "TITLE SCREEN"};
            int r = ui_menu(7, 8, 16, after, 3, 0, 0);
            if (r == 0)
                continue;
            if (r == 1)
                break;
            /* exhibition never touches the save; restore the career in RAM */
            if (s_hasSave)
                save_load();
            return;
        }
    }
}

/* attract mode: the CPU plays a game until a button is pressed */
static void demo_game(void)
{
    if (!(s_hasSave && save_load()))
        league_new(0, DIFF_PRO, "COACH", g_frame * 2891336453u + 7);
    int a = rng_range(NUM_TEAMS), b = (a + 1 + rng_range(NUM_TEAMS - 1)) % NUM_TEAMS;
    MatchResult mr;
    gfx_fade_out();
    match_play(a, b, a, MF_EXHIBITION | MF_DEMO, &mr);
    if (s_hasSave)
        save_load();
    music_play(MUS_TITLE);
}

/* ------------------------------------------------------------------ */
/* title                                                               */
/* ------------------------------------------------------------------ */

void screen_title(void)
{
    s_hasSave = save_load();
    if (s_hasSave)
        snd_set_enabled(g_career.soundOn);
    int sel = 0;
    for (;;) {
        ui_screen(0);
        big_text(5, 2, "PIXEL");
        big_text(8, 5, "PIGSKIN");
        txt_center(8, "ARCADE FOOTBALL CAREER", PAL_CYAN);
        txt_center(18, "PLAYER SPRITES BY JORDANTRS", PAL_GRAY);
        music_play(MUS_TITLE);
        static const char *items[5];
        items[0] = "CONTINUE CAREER";
        items[1] = "NEW CAREER";
        items[2] = "EXHIBITION";
        items[3] = "HOW TO PLAY";
        items[4] = snd_enabled() ? "SOUND: ON" : "SOUND: OFF";
        oam_begin();
        oam_add(176, 34, OT_BIGBALL, SPR_32x16, OPAL_MISC, 0, 0);
        ui_set_menu_timeout(60 * 20);
        int r = ui_menu(6, 10, 19, items, 5, s_hasSave ? sel : (sel ? sel : 1), s_hasSave ? 0 : 1);
        ui_set_menu_timeout(0);
        oam_begin();
        if (r == -2) {
            demo_game();
            continue;
        }
        if (r < 0)
            continue;
        sel = r;
        switch (r) {
        case 0:
            if (save_load()) {
                gfx_fade_out();
                gfx_fade(0);
                screen_career();
            }
            break;
        case 1:
            if (screen_new_career()) {
                s_hasSave = 1;
                screen_career();
            }
            break;
        case 2:
            screen_quick_game();
            break;
        case 3:
            show_controls();
            break;
        case 4: {
            int on = !snd_enabled();
            snd_set_enabled(on);
            if (s_hasSave) {
                g_career.soundOn = (u8)on;
                save_write();
            }
            if (on)
                music_play(MUS_TITLE);
            break;
        }
        }
        s_hasSave = save_exists();
    }
}
