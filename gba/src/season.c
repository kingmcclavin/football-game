#include "season.h"
#include "offseason.h"
#include "sim.h"
#include "rng.h"
#include "util.h"
#include <string.h>

int team_conf(int team)
{
    return team / TEAMS_PER_CONF;
}

void season_new_schedule(void)
{
    Career *c = &g_career;
    u8 perm[NUM_TEAMS];
    for (int i = 0; i < NUM_TEAMS; i++)
        perm[i] = (u8)i;
    for (int i = NUM_TEAMS - 1; i > 0; i--) {
        int j = rng_range(i + 1);
        u8 t = perm[i];
        perm[i] = perm[j];
        perm[j] = t;
    }
    /* circle method round robin: 15 rounds, everyone plays everyone once */
    u8 rot[NUM_TEAMS];
    for (int i = 0; i < NUM_TEAMS; i++)
        rot[i] = (u8)i;
    u8 order[NUM_WEEKS];
    for (int i = 0; i < NUM_WEEKS; i++)
        order[i] = (u8)i;
    for (int i = NUM_WEEKS - 1; i > 0; i--) {
        int j = rng_range(i + 1);
        u8 t = order[i];
        order[i] = order[j];
        order[j] = t;
    }
    for (int r = 0; r < NUM_WEEKS; r++) {
        int w = order[r];
        for (int i = 0; i < GAMES_PER_WEEK; i++) {
            int a = perm[rot[i]], b = perm[rot[NUM_TEAMS - 1 - i]];
            GameRec *g = &c->sched[w][i];
            if ((r + i) & 1) {
                g->home = (u8)a;
                g->away = (u8)b;
            } else {
                g->home = (u8)b;
                g->away = (u8)a;
            }
            g->hs = UNPLAYED;
            g->as = 0;
        }
        /* rotate all but the first */
        u8 last = rot[NUM_TEAMS - 1];
        for (int i = NUM_TEAMS - 1; i > 1; i--)
            rot[i] = rot[i - 1];
        rot[1] = last;
    }
    for (int i = 0; i < NUM_PLAYOFF_GAMES; i++) {
        c->playoff[i].home = TEAM_NONE;
        c->playoff[i].away = TEAM_NONE;
        c->playoff[i].hs = UNPLAYED;
    }
}

int playoff_first(int round)
{
    static const u8 f[3] = {0, 4, 6};
    return f[CLAMP(round, 0, 2)];
}

int playoff_count(int round)
{
    static const u8 n[3] = {4, 2, 1};
    return n[CLAMP(round, 0, 2)];
}

int season_games_this_week(GameRec **out)
{
    Career *c = &g_career;
    if (c->phase == PH_REGULAR) {
        *out = c->sched[c->week];
        return GAMES_PER_WEEK;
    }
    if (c->phase == PH_PLAYOFFS) {
        *out = &c->playoff[playoff_first(c->week)];
        return playoff_count(c->week);
    }
    *out = 0;
    return 0;
}

GameRec *season_user_game(void)
{
    GameRec *g;
    int n = season_games_this_week(&g);
    for (int i = 0; i < n; i++)
        if (g[i].home == g_career.userTeam || g[i].away == g_career.userTeam)
            return &g[i];
    return 0;
}

int season_user_is_home(const GameRec *g)
{
    return g->home == g_career.userTeam;
}

int playoff_winner(const GameRec *g)
{
    if (g->hs == UNPLAYED)
        return TEAM_NONE;
    return g->hs > g->as ? g->home : g->away;
}

static void injure_random(int team)
{
    s16 ids[ROSTER_MAX + 8];
    int n = team_roster(team, ids, COUNTOF(ids));
    if (!n)
        return;
    Player *p = &g_career.players[ids[rng_range(n)]];
    if (p->injury)
        return;
    int w = rng_chance(60) ? 1 : rng_between(2, 5);
    if (team == g_career.userTeam && g_career.fac[FAC_REHAB] && rng_chance(g_career.fac[FAC_REHAB] * 15))
        w = MAX(1, w - 1);
    p->injury = (u8)w;
}

static void team_result(int team, int pf, int pa, int home)
{
    Career *c = &g_career;
    TeamSeason *t = &c->ts[team];
    int playoff = c->phase == PH_PLAYOFFS;
    if (!playoff) {
        t->pf += (u16)pf;
        t->pa += (u16)pa;
    }
    int user = team == c->userTeam;
    if (pf > pa) {
        if (!playoff)
            t->w++;
        t->streak = (t->streak & 0x80) ? 1 : (u8)MIN(t->streak + 1, 99);
        int gain = 5 + (home && user ? c->fac[FAC_STADIUM] : 0);
        t->morale = (u8)MIN(99, t->morale + gain);
    } else if (pf < pa) {
        if (!playoff)
            t->l++;
        t->streak = (t->streak & 0x80) ? (u8)(0x80 | MIN((t->streak & 0x7F) + 1, 99)) : 0x81;
        t->morale = (u8)MAX(10, t->morale - 5);
    } else {
        if (!playoff)
            t->t++;
        t->streak = 0;
    }
    if (user) {
        if (playoff) {
            if (pf > pa) {
                c->playoffW++;
                c->coachPoints += 5;
            } else {
                c->playoffL++;
                c->coachPoints += 1;
            }
        } else {
            if (pf > pa) {
                c->careerW++;
                c->coachPoints += 3;
            } else if (pf < pa) {
                c->careerL++;
                c->coachPoints += 1;
            } else {
                c->careerT++;
                c->coachPoints += 2;
            }
        }
        if (c->coachPoints > 999)
            c->coachPoints = 999;
    }
}

void season_record(GameRec *g, int hs, int as, int simInjuries)
{
    g->hs = (u8)CLAMP(hs, 0, 254);
    g->as = (u8)CLAMP(as, 0, 254);
    team_result(g->home, hs, as, 1);
    team_result(g->away, as, hs, 0);
    if (simInjuries) {
        if (rng_chance(30))
            injure_random(g->home);
        if (rng_chance(30))
            injure_random(g->away);
    }
}

void season_sim_others(void)
{
    GameRec *g;
    int n = season_games_this_week(&g);
    int allowTie = g_career.phase == PH_REGULAR;
    for (int i = 0; i < n; i++) {
        if (g[i].hs != UNPLAYED)
            continue;
        if (g[i].home == g_career.userTeam || g[i].away == g_career.userTeam)
            continue;
        if (g[i].home == TEAM_NONE)
            continue;
        int hs, as;
        sim_game(g[i].home, g[i].away, allowTie, &hs, &as, 0);
        season_record(&g[i], hs, as, 1);
    }
}

int season_week_done(void)
{
    GameRec *g;
    int n = season_games_this_week(&g);
    for (int i = 0; i < n; i++)
        if (g[i].hs == UNPLAYED && g[i].home != TEAM_NONE)
            return 0;
    return 1;
}

static int cmp_teams(int a, int b)
{
    /* returns >0 if a ranks above b */
    const TeamSeason *ta = &g_career.ts[a], *tb = &g_career.ts[b];
    int ga = ta->w + ta->l + ta->t, gb = tb->w + tb->l + tb->t;
    int pa = ga ? (ta->w * 2 + ta->t) * 1000 / (ga * 2) : 500;
    int pb = gb ? (tb->w * 2 + tb->t) * 1000 / (gb * 2) : 500;
    if (pa != pb)
        return pa - pb;
    int da = ta->pf - ta->pa, db = tb->pf - tb->pa;
    if (da != db)
        return da - db;
    if (ta->pf != tb->pf)
        return ta->pf - tb->pf;
    return b - a;
}

int standings_sorted(int conf, u8 *out)
{
    for (int i = 0; i < TEAMS_PER_CONF; i++)
        out[i] = (u8)(conf * TEAMS_PER_CONF + i);
    for (int i = 1; i < TEAMS_PER_CONF; i++) {
        u8 v = out[i];
        int j = i - 1;
        while (j >= 0 && cmp_teams(v, out[j]) > 0) {
            out[j + 1] = out[j];
            j--;
        }
        out[j + 1] = v;
    }
    return TEAMS_PER_CONF;
}

int user_seed(void)
{
    if (g_career.phase == PH_REGULAR)
        return 0;
    for (int c = 0; c < 2; c++)
        for (int s = 0; s < 4; s++)
            if (g_career.seeds[c][s] == g_career.userTeam)
                return s + 1;
    return 0;
}

static void set_game(GameRec *g, int home, int away)
{
    g->home = (u8)home;
    g->away = (u8)away;
    g->hs = UNPLAYED;
    g->as = 0;
}

static int seed_of(int team)
{
    for (int c = 0; c < 2; c++)
        for (int s = 0; s < 4; s++)
            if (g_career.seeds[c][s] == team)
                return s;
    return 9;
}

static void playoffs_begin(void)
{
    Career *c = &g_career;
    for (int conf = 0; conf < 2; conf++) {
        u8 st[TEAMS_PER_CONF];
        standings_sorted(conf, st);
        for (int s = 0; s < 4; s++)
            c->seeds[conf][s] = st[s];
        set_game(&c->playoff[conf * 2 + 0], st[0], st[3]);
        set_game(&c->playoff[conf * 2 + 1], st[1], st[2]);
    }
    c->phase = PH_PLAYOFFS;
    c->week = 0;
    if (user_seed())
        c->playoffApps++;
    else
        c->userEliminated = 1;
}

void season_advance(void)
{
    Career *c = &g_career;
    /* weekly upkeep */
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &c->players[i];
        if (p->team == TEAM_NONE)
            continue;
        if (p->injury) {
            p->injury--;
            if (p->injury && p->team == c->userTeam && c->fac[FAC_REHAB] &&
                rng_chance(c->fac[FAC_REHAB] * 10))
                p->injury--;
        }
        p->flags &= (u8)~PF_TRAINED;
    }
    for (int t = 0; t < NUM_TEAMS; t++) {
        TeamSeason *ts = &c->ts[t];
        ts->chem = (u8)MIN(100, ts->chem + 2);
        /* morale drifts back toward 55 */
        if (ts->morale > 70)
            ts->morale--;
        if (ts->morale < 40)
            ts->morale++;
    }

    if (c->phase == PH_REGULAR) {
        c->week++;
        if (c->week >= NUM_WEEKS)
            playoffs_begin();
        return;
    }
    if (c->phase == PH_PLAYOFFS) {
        GameRec *g = &c->playoff[playoff_first(c->week)];
        int n = playoff_count(c->week);
        for (int i = 0; i < n; i++) {
            int w = playoff_winner(&g[i]);
            int l = (w == g[i].home) ? g[i].away : g[i].home;
            if (l == c->userTeam)
                c->userEliminated = 1;
        }
        if (c->week == 0) {
            for (int conf = 0; conf < 2; conf++) {
                int a = playoff_winner(&c->playoff[conf * 2]);
                int b = playoff_winner(&c->playoff[conf * 2 + 1]);
                if (seed_of(a) <= seed_of(b))
                    set_game(&c->playoff[4 + conf], a, b);
                else
                    set_game(&c->playoff[4 + conf], b, a);
            }
            c->week = 1;
        } else if (c->week == 1) {
            int a = playoff_winner(&c->playoff[4]);
            int b = playoff_winner(&c->playoff[5]);
            const TeamSeason *ta = &c->ts[a], *tb = &c->ts[b];
            if (ta->w > tb->w || (ta->w == tb->w && a < b))
                set_game(&c->playoff[6], a, b);
            else
                set_game(&c->playoff[6], b, a);
            c->week = 2;
        } else {
            off_begin();
        }
    }
}

void season_week_label(char *buf)
{
    static const char *const rounds[3] = {"DIVISIONAL ROUND", "CONFERENCE FINAL", CHAMPIONSHIP_NAME " GAME"};
    if (g_career.phase == PH_REGULAR)
        fmt(buf, "WEEK %d", g_career.week + 1);
    else if (g_career.phase == PH_PLAYOFFS)
        fmt(buf, "%s", rounds[CLAMP(g_career.week, 0, 2)]);
    else
        fmt(buf, "OFFSEASON");
}

void team_record_str(int team, char *buf)
{
    const TeamSeason *t = &g_career.ts[team];
    if (t->t)
        fmt(buf, "%d-%d-%d", t->w, t->l, t->t);
    else
        fmt(buf, "%d-%d", t->w, t->l);
}

void season_sim_user(void)
{
    GameRec *g = season_user_game();
    if (!g || g->hs != UNPLAYED)
        return;
    SideStats st[2];
    memset(st, 0, sizeof(st));
    int hs, as;
    sim_game(g->home, g->away, g_career.phase == PH_REGULAR, &hs, &as, st);
    const SideStats *u = &st[season_user_is_home(g) ? 0 : 1];
    SeasonStats *ss = &g_career.stats;
    ss->passYds += u->passYds;
    ss->rushYds += u->rushYds;
    ss->passTD += u->passTD;
    ss->rushTD += u->rushTD;
    ss->ints += u->ints;
    ss->fumbles += u->fumbles;
    ss->sacksAllowed += u->sacks;
    ss->fgMade += u->fgm;
    ss->fgAtt += u->fga;
    g_career.careerPassYds += u->passYds;
    g_career.careerRushYds += u->rushYds;
    g_career.careerTDs += (u16)(u->passTD + u->rushTD);
    season_record(g, hs, as, 1);
}
