#include "league.h"
#include "rng.h"
#include "season.h"
#include <string.h>

Career g_career EWRAM_BSS;

const u8 slot_pos[LINEUP_SLOTS] = {
    POS_QB, POS_RB, POS_WR, POS_WR, POS_TE, POS_OL, POS_OL, POS_OL, POS_OL, POS_K,
    POS_DL, POS_DL, POS_DL, POS_LB, POS_LB, POS_DB, POS_DB, POS_DB, POS_DB,
};

#define RESERVE_RATING 38

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

int player_ovr(const Player *p)
{
    const PosInfo *pi = &pos_info[p->pos];
    int s = 0;
    for (int i = 0; i < 4; i++)
        s += p->attr[i] * pi->weight[i];
    return s >> 4;
}

int player_attr(int idx, int a)
{
    if (idx < 0)
        return RESERVE_RATING;
    return g_career.players[idx].attr[a];
}

int player_market_salary(const Player *p)
{
    int ovr = player_ovr(p);
    int base = 5;
    if (ovr > 45)
        base += (ovr - 45) * (ovr - 45) * 85 / 1000;
    base = base * pos_info[p->pos].salaryPct / 100;
    if (p->age >= 32)
        base = base * 80 / 100;
    if (base < 5)
        base = 5;
    return base;
}

static void copy_str(char *dst, const char *src)
{
    while (*src)
        *dst++ = *src++;
    *dst = 0;
}

void player_short_name(const Player *p, char *out)
{
    out[0] = first_names[p->first][0];
    out[1] = '.';
    out[2] = ' ';
    copy_str(out + 3, last_names[p->last]);
}

void player_full_name(const Player *p, char *out)
{
    const char *f = first_names[p->first];
    while (*f)
        *out++ = *f++;
    *out++ = ' ';
    copy_str(out, last_names[p->last]);
}

const char *player_last_name(const Player *p)
{
    return last_names[p->last];
}

int player_stars(const Player *p)
{
    int pot = p->pot;
    if (pot >= 88)
        return 5;
    if (pot >= 80)
        return 4;
    if (pot >= 72)
        return 3;
    if (pot >= 62)
        return 2;
    return 1;
}

static int pos_attr_bias(int pos, int a)
{
    /* Small per-position flavour so archetypes differ. */
    switch (pos) {
    case POS_QB: return a == 2 ? -8 : 0;
    case POS_RB: return a == 0 ? 4 : (a == 3 ? -4 : 0);
    case POS_WR: return a == 0 ? 5 : 0;
    case POS_TE: return a == 0 ? -6 : 0;
    case POS_OL: return a == 3 ? -25 : 0;
    case POS_DL: return a == 3 ? -12 : 0;
    case POS_LB: return 0;
    case POS_DB: return a == 1 ? 5 : 0;
    default: return 0;
    }
}

void gen_player(Player *p, int pos, int quality, int ageMin, int ageMax)
{
    memset(p, 0, sizeof(*p));
    p->pos = (u8)pos;
    p->first = (u8)rng_range(NUM_FIRST_NAMES);
    p->last = (u8)rng_range(NUM_LAST_NAMES);
    p->age = (u8)rng_between(ageMin, ageMax);
    int youth = 0;
    if (p->age < 25)
        youth = (25 - p->age) * 3;
    for (int a = 0; a < 4; a++) {
        if (pos == POS_K && a >= 2) {
            p->attr[a] = 0;
            continue;
        }
        int v = quality + rng_between(-9, 9) + pos_attr_bias(pos, a) - youth;
        p->attr[a] = (u8)CLAMP(v, 20, 99);
    }
    int ovr = player_ovr(p);
    int headroom;
    if (p->age <= 23)
        headroom = rng_between(6, 26);
    else if (p->age <= 26)
        headroom = rng_between(3, 14);
    else if (p->age <= 29)
        headroom = rng_between(0, 6);
    else
        headroom = rng_between(0, 2);
    p->pot = (u8)CLAMP(ovr + headroom, ovr, 99);
    p->salary = (u16)player_market_salary(p);
    p->years = (u8)rng_between(1, 4);
}

int alloc_player(void)
{
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == TEAM_NONE)
            return i;
    return -1;
}

/* ------------------------------------------------------------------ */
/* Teams                                                               */
/* ------------------------------------------------------------------ */

static int collect_team(int team, s16 *out, int max)
{
    int n = 0;
    for (int i = 0; i < MAX_PLAYERS && n < max; i++)
        if (g_career.players[i].team == team)
            out[n++] = (s16)i;
    return n;
}

void team_lineup(int team, Lineup *lu)
{
    s16 ids[ROSTER_MAX + 8];
    u8 used[ROSTER_MAX + 8];
    int n = collect_team(team, ids, COUNTOF(ids));
    memset(used, 0, sizeof(used));
    for (int s = 0; s < LINEUP_SLOTS; s++) {
        int best = -1, bestOvr = -1;
        for (int k = 0; k < n; k++) {
            const Player *p = &g_career.players[ids[k]];
            if (used[k] || p->pos != slot_pos[s] || p->injury)
                continue;
            int o = player_ovr(p);
            if (o > bestOvr) {
                bestOvr = o;
                best = k;
            }
        }
        if (best >= 0) {
            used[best] = 1;
            lu->idx[s] = ids[best];
        } else {
            lu->idx[s] = -1;
        }
    }
}

static int slot_ovr(const Lineup *lu, int s)
{
    if (lu->idx[s] < 0)
        return RESERVE_RATING;
    return player_ovr(&g_career.players[lu->idx[s]]);
}

static int slot_attr(const Lineup *lu, int s, int a)
{
    return player_attr(lu->idx[s], a);
}

void team_strength(int team, TeamStrength *ts, int homeBonus)
{
    Lineup lu;
    team_lineup(team, &lu);
    int ol = 0, olr = 0;
    for (int s = SL_OL1; s <= SL_OL4; s++) {
        ol += slot_attr(&lu, s, 0);
        olr += slot_attr(&lu, s, 1);
    }
    ol /= 4;
    olr /= 4;
    int wr = (slot_ovr(&lu, SL_WR1) + slot_ovr(&lu, SL_WR2)) / 2;
    int te = slot_ovr(&lu, SL_TE);
    int qbAcc = slot_attr(&lu, SL_QB, 1), qbArm = slot_attr(&lu, SL_QB, 0);
    int qb = slot_ovr(&lu, SL_QB);
    ts->qbAcc = (s16)qbAcc;
    ts->qbArm = (s16)qbArm;
    ts->passOff = (s16)((qb * 4 + wr * 3 + te + ol * 2) / 10);
    ts->runOff = (s16)((slot_ovr(&lu, SL_RB) * 4 + olr * 3 + slot_attr(&lu, SL_TE, 2) + qb) / 9);

    int db = 0, dbt = 0;
    for (int s = SL_DB1; s <= SL_DB4; s++) {
        db += slot_attr(&lu, s, 0);
        dbt += slot_attr(&lu, s, 2);
    }
    db /= 4;
    dbt /= 4;
    int prs = 0, rst = 0;
    for (int s = SL_DL1; s <= SL_DL3; s++) {
        prs += slot_attr(&lu, s, 0);
        rst += slot_attr(&lu, s, 1);
    }
    prs /= 3;
    rst /= 3;
    int lbt = (slot_attr(&lu, SL_LB1, 0) + slot_attr(&lu, SL_LB2, 0)) / 2;
    int lbc = (slot_attr(&lu, SL_LB1, 1) + slot_attr(&lu, SL_LB2, 1)) / 2;
    ts->passDef = (s16)((db * 4 + lbc + prs * 2) / 7);
    ts->runDef = (s16)((rst * 3 + lbt * 3 + dbt) / 7);
    ts->kick = (s16)((slot_attr(&lu, SL_K, 0) + slot_attr(&lu, SL_K, 1)) / 2);

    const TeamSeason *t = &g_career.ts[team];
    int mod = (t->morale - 50) / 12 + (t->chem - 50) / 16 + homeBonus;
    if (homeBonus && team == g_career.userTeam)
        mod += g_career.fac[FAC_STADIUM] / 2;
    ts->passOff += mod;
    ts->runOff += mod;
    ts->passDef += mod;
    ts->runDef += mod;
}

int team_payroll(int team)
{
    int s = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == team)
            s += g_career.players[i].salary;
    return s;
}

int team_cap_room(int team)
{
    return SALARY_CAP - team_payroll(team);
}

int team_count(int team)
{
    int n = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == team)
            n++;
    return n;
}

int team_pos_count(int team, int pos)
{
    int n = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == team && g_career.players[i].pos == pos)
            n++;
    return n;
}

int team_off_ovr(int team)
{
    Lineup lu;
    team_lineup(team, &lu);
    int s = 0;
    s += slot_ovr(&lu, SL_QB) * 4;
    s += slot_ovr(&lu, SL_RB) * 2;
    s += (slot_ovr(&lu, SL_WR1) + slot_ovr(&lu, SL_WR2)) * 2;
    s += slot_ovr(&lu, SL_TE);
    for (int k = SL_OL1; k <= SL_OL4; k++)
        s += slot_ovr(&lu, k);
    return s / 15;
}

int team_def_ovr(int team)
{
    Lineup lu;
    team_lineup(team, &lu);
    int s = 0;
    for (int k = SL_DL1; k <= SL_DB4; k++)
        s += slot_ovr(&lu, k);
    return s / 9;
}

int team_ovr(int team)
{
    return (team_off_ovr(team) * 11 + team_def_ovr(team) * 9) / 20;
}

int team_roster(int team, s16 *out, int max)
{
    int n = collect_team(team, out, max);
    /* insertion sort: position, then overall desc */
    for (int i = 1; i < n; i++) {
        s16 v = out[i];
        const Player *pv = &g_career.players[v];
        int ov = player_ovr(pv);
        int j = i - 1;
        while (j >= 0) {
            const Player *pj = &g_career.players[out[j]];
            if (pj->pos > pv->pos || (pj->pos == pv->pos && player_ovr(pj) < ov)) {
                out[j + 1] = out[j];
                j--;
            } else {
                break;
            }
        }
        out[j + 1] = v;
    }
    return n;
}

int team_used_numbers_has(int team, int num)
{
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == team && g_career.players[i].number == num)
            return 1;
    return 0;
}

int team_pick_number(int team, int pos)
{
    static const u8 lo[NUM_POS] = {1, 20, 10, 80, 60, 90, 40, 20, 1};
    static const u8 hi[NUM_POS] = {19, 39, 19, 89, 79, 99, 59, 39, 19};
    for (int tries = 0; tries < 40; tries++) {
        int n = rng_between(lo[pos], hi[pos]);
        if (team >= NUM_TEAMS || !team_used_numbers_has(team, n))
            return n;
    }
    for (int n = 1; n < 100; n++)
        if (!team_used_numbers_has(team, n))
            return n;
    return 0;
}

/* ------------------------------------------------------------------ */
/* League creation                                                     */
/* ------------------------------------------------------------------ */

static void fit_payroll(int team)
{
    int pay = team_payroll(team);
    int target = SALARY_CAP - 60;
    if (pay <= target)
        return;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &g_career.players[i];
        if (p->team == team) {
            int s = (int)p->salary * target / pay;
            p->salary = (u16)(s < 5 ? 5 : s);
        }
    }
}

void league_gen_fa(int count)
{
    for (int k = 0; k < count; k++) {
        int idx = alloc_player();
        if (idx < 0)
            return;
        Player *p = &g_career.players[idx];
        int pos = rng_range(NUM_POS);
        gen_player(p, pos, rng_between(44, 66), 23, 33);
        p->team = TEAM_FA;
        p->number = (u8)team_pick_number(TEAM_FA, pos);
        p->years = 0;
    }
}

void league_new(int userTeam, int difficulty, const char *coachName, u32 seed)
{
    Career *c = &g_career;
    memset(c, 0, sizeof(*c));
    rng_seed(seed);
    c->magic = 0x50585053; /* "SPXP" */
    c->userTeam = (u8)userTeam;
    c->difficulty = (u8)difficulty;
    c->quarterMin = 4;
    c->soundOn = 1;
    for (int i = 0; i < 11 && coachName[i]; i++)
        c->coachName[i] = coachName[i];
    c->year = 2026;
    c->seasonNum = 1;
    c->reputation = 25;
    c->coachPoints = 4;

    for (int i = 0; i < MAX_PLAYERS; i++)
        c->players[i].team = TEAM_NONE;

    for (int t = 0; t < NUM_TEAMS; t++) {
        int quality = rng_between(52, 68);
        for (int pos = 0; pos < NUM_POS; pos++) {
            int n = pos_info[pos].rosterGen;
            for (int k = 0; k < n; k++) {
                int idx = alloc_player();
                Player *p = &c->players[idx];
                int q = quality + (k < pos_info[pos].starters ? rng_between(-2, 10) : rng_between(-14, -4));
                gen_player(p, pos, q, 21, 33);
                p->team = (u8)t;
                p->number = (u8)team_pick_number(t, pos);
            }
        }
        fit_payroll(t);
        c->ts[t].morale = 60;
        c->ts[t].chem = 60;
    }
    league_gen_fa(36);
    season_new_schedule();
}

int fa_asking_salary(const Player *p)
{
    int s = player_market_salary(p);
    s = s * (112 - g_career.reputation / 5) / 100;
    s = s * (100 - g_career.fac[FAC_STADIUM] * 3) / 100;
    return s < 5 ? 5 : s;
}

int fa_willing(const Player *p)
{
    int ovr = player_ovr(p);
    if (ovr < 76)
        return 1;
    return g_career.reputation >= (ovr - 72) * 3;
}

/* Returns 0 on success, 1 roster full, 2 over cap. */
int league_sign(int pidx, int team, int salary, int years)
{
    Player *p = &g_career.players[pidx];
    if (team_count(team) >= ROSTER_MAX)
        return 1;
    if (team_payroll(team) + salary > SALARY_CAP)
        return 2;
    p->team = (u8)team;
    p->salary = (u16)salary;
    p->years = (u8)years;
    p->number = (u8)team_pick_number(team, p->pos);
    if (team == g_career.userTeam) {
        TeamSeason *t = &g_career.ts[team];
        t->chem = (u8)MAX(0, t->chem - 3);
    }
    return 0;
}

void league_release(int pidx)
{
    Player *p = &g_career.players[pidx];
    int team = p->team;
    p->team = TEAM_FA;
    p->years = 0;
    p->flags &= (u8)~PF_ROOKIE;
    if (team < NUM_TEAMS) {
        TeamSeason *t = &g_career.ts[team];
        t->chem = (u8)MAX(0, t->chem - 3);
        if (player_ovr(p) >= 70)
            t->morale = (u8)MAX(0, t->morale - 3);
    }
}

int train_cost(const Player *p)
{
    int o = player_ovr(p);
    if (o < 65)
        return 2;
    if (o < 75)
        return 3;
    if (o < 85)
        return 4;
    return 5;
}

/* Returns 0 ok, 1 not enough CP, 2 already trained, 3 at potential. */
int train_player(int pidx)
{
    Player *p = &g_career.players[pidx];
    int cost = train_cost(p);
    if (p->flags & PF_TRAINED)
        return 2;
    if (player_ovr(p) >= p->pot)
        return 3;
    if (g_career.coachPoints < cost)
        return 1;
    g_career.coachPoints -= (u16)cost;
    p->flags |= PF_TRAINED;
    /* raise the two most important attributes */
    const PosInfo *pi = &pos_info[p->pos];
    int a1 = 0, a2 = 1;
    for (int a = 0; a < 4; a++)
        if (pi->weight[a] > pi->weight[a1])
            a1 = a;
    a2 = (a1 == 0) ? 1 : 0;
    for (int a = 0; a < 4; a++)
        if (a != a1 && pi->weight[a] > pi->weight[a2])
            a2 = a;
    p->attr[a1] = (u8)MIN(99, p->attr[a1] + 2);
    p->attr[a2] = (u8)MIN(99, p->attr[a2] + 2);
    return 0;
}

int facility_cost(int fac)
{
    return 6 * (g_career.fac[fac] + 1);
}
