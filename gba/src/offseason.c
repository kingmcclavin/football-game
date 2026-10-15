#include "offseason.h"
#include "season.h"
#include "rng.h"
#include <string.h>

ChangeInfo off_changes[MAX_CHANGES];
int off_num_changes;
int off_league_retired;

static int user_finish(void)
{
    const Career *c = &g_career;
    int u = c->userTeam;
    const GameRec *f = &c->playoff[6];
    if (f->home == u || f->away == u)
        return playoff_winner(f) == u ? FIN_CHAMP : FIN_FINAL;
    if (c->playoff[4].home == u || c->playoff[4].away == u || c->playoff[5].home == u || c->playoff[5].away == u)
        return FIN_CONF;
    for (int i = 0; i < 4; i++)
        if (c->playoff[i].home == u || c->playoff[i].away == u)
            return FIN_ROUND1;
    return FIN_MISSED;
}

void off_begin(void)
{
    Career *c = &g_career;
    const TeamSeason *ut = &c->ts[c->userTeam];
    int fin = user_finish();
    int champ = playoff_winner(&c->playoff[6]);
    int runner = (champ == c->playoff[6].home) ? c->playoff[6].away : c->playoff[6].home;

    if (c->numHist >= MAX_HISTORY) {
        memmove(&c->hist[0], &c->hist[1], sizeof(HistEntry) * (MAX_HISTORY - 1));
        c->numHist = MAX_HISTORY - 1;
    }
    HistEntry *h = &c->hist[c->numHist++];
    h->year = c->year;
    h->champ = (u8)champ;
    h->runnerUp = (u8)runner;
    h->userW = ut->w;
    h->userL = ut->l;
    h->userT = ut->t;
    h->userFinish = (u8)fin;

    if (fin == FIN_CHAMP)
        c->titles++;
    if (ut->w > c->bestWins)
        c->bestWins = ut->w;

    int rep = c->reputation + (ut->w - ut->l) / 2;
    static const s8 finRep[5] = {-3, 3, 6, 9, 15};
    rep += finRep[fin];
    c->reputation = (u8)CLAMP(rep, 0, 100);
    static const u8 finCP[5] = {2, 4, 6, 8, 12};
    c->coachPoints = (u16)MIN(999, c->coachPoints + finCP[fin]);

    c->phase = PH_OFFSEASON;
    c->offStage = OFF_RECAP;
}

static void add_change(int idx, int oldOvr, int newOvr, int retired)
{
    if (off_num_changes >= MAX_CHANGES)
        return;
    const Player *p = &g_career.players[idx];
    ChangeInfo *ci = &off_changes[off_num_changes++];
    ci->idx = (s16)idx;
    ci->oldOvr = (u8)oldOvr;
    ci->newOvr = (u8)newOvr;
    ci->retired = (u8)retired;
    ci->age = p->age;
    ci->pos = p->pos;
    ci->first = p->first;
    ci->last = p->last;
}

static void progress_player(Player *p, int bonus)
{
    int age = p->age;
    int lo, hi;
    if (age <= 23) { lo = 1; hi = 6; }
    else if (age <= 26) { lo = 0; hi = 4; }
    else if (age <= 29) { lo = -1; hi = 2; }
    else if (age <= 31) { lo = -3; hi = 0; }
    else if (age <= 33) { lo = -5; hi = -1; }
    else { lo = -7; hi = -2; }
    int base = rng_between(lo, hi);
    for (int a = 0; a < 4; a++) {
        if (p->pos == POS_K && a >= 2)
            continue;
        int d = base + rng_between(-1, 1);
        if (d > 0)
            d += bonus;
        int v = p->attr[a] + d;
        p->attr[a] = (u8)CLAMP(v, 15, 99);
    }
    /* positive growth is capped by potential */
    while (player_ovr(p) > p->pot) {
        int changed = 0;
        for (int a = 0; a < 4; a++)
            if (p->attr[a] > 15 && !(p->pos == POS_K && a >= 2)) {
                p->attr[a]--;
                changed = 1;
            }
        if (!changed)
            break;
    }
}

void off_progress(void)
{
    Career *c = &g_career;
    off_num_changes = 0;
    off_league_retired = 0;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &c->players[i];
        if (p->team == TEAM_NONE || p->team == TEAM_DRAFT)
            continue;
        int user = p->team == c->userTeam;
        int oldOvr = player_ovr(p);
        p->age++;
        p->injury = 0;
        p->flags &= (u8)~(PF_TRAINED | PF_ROOKIE);
        /* retirement */
        int chance = 0;
        if (p->age >= 33)
            chance = (p->age - 32) * 18;
        if (p->age >= 30 && oldOvr < 55)
            chance += 25;
        if (p->team == TEAM_FA && p->age >= 31)
            chance += 30;
        if (p->age >= 38)
            chance = 100;
        if (rng_chance(chance)) {
            if (user)
                add_change(i, oldOvr, oldOvr, 1);
            if (p->team != TEAM_FA)
                off_league_retired++;
            p->team = TEAM_NONE;
            continue;
        }
        progress_player(p, user ? c->fac[FAC_TRAINING] : (c->difficulty == DIFF_LEGEND ? 1 : 0));
        if (p->years)
            p->years--;
        if (user) {
            int n = player_ovr(p);
            if (n != oldOvr || p->years == 0)
                add_change(i, oldOvr, n, 0);
        }
    }
    c->offStage = OFF_RESIGN;
}

int off_resign_salary(const Player *p)
{
    int s = player_market_salary(p);
    int morale = g_career.ts[g_career.userTeam].morale;
    if (morale < 50)
        s = s * 110 / 100;
    return s;
}

int off_resign_years(const Player *p)
{
    if (p->age >= 32)
        return 1;
    if (p->age >= 29)
        return 2;
    return 3;
}

int off_resign_refuses(const Player *p)
{
    /* unhappy stars may test free agency */
    int morale = g_career.ts[g_career.userTeam].morale;
    if (morale >= 45)
        return 0;
    int o = player_ovr(p);
    return o >= 72 && ((p->first + p->last + g_career.year) % 3 == 0);
}

int off_resign(int pidx)
{
    Player *p = &g_career.players[pidx];
    int sal = off_resign_salary(p);
    if (off_resign_refuses(p))
        return 4;
    /* expiring player's current salary is replaced by the new one */
    if (team_payroll(g_career.userTeam) - p->salary + sal > SALARY_CAP)
        return 2;
    p->salary = (u16)sal;
    p->years = (u8)off_resign_years(p);
    return 0;
}

void off_resign_finish(void)
{
    Career *c = &g_career;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &c->players[i];
        if (p->team >= NUM_TEAMS || p->years)
            continue;
        if (p->team == c->userTeam) {
            p->team = TEAM_FA;
            continue;
        }
        int o = player_ovr(p);
        int sal = player_market_salary(p);
        if (o >= 58 && p->age <= 32 && team_payroll(p->team) - p->salary + sal <= SALARY_CAP && rng_chance(80)) {
            p->salary = (u16)sal;
            p->years = (u8)off_resign_years(p);
        } else {
            p->team = TEAM_FA;
        }
    }
    c->offStage = OFF_DRAFT;
}

/* ---------------- draft ---------------- */

static int draft_value(const Player *p)
{
    return (player_ovr(p) + p->pot * 2) / 3;
}

void off_draft_begin(void)
{
    Career *c = &g_career;
    /* clear any leftover prospects */
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (c->players[i].team == TEAM_DRAFT)
            c->players[i].team = TEAM_NONE;
    for (int k = 0; k < DRAFT_CLASS; k++) {
        int idx = alloc_player();
        if (idx < 0)
            break;
        Player *p = &c->players[idx];
        static const u8 posw[NUM_POS] = {4, 4, 6, 3, 7, 6, 4, 7, 2};
        int r = rng_range(43), pos = 0;
        while (r >= posw[pos]) {
            r -= posw[pos];
            pos++;
        }
        int q = rng_chance(15) ? rng_between(66, 78) : rng_between(52, 68);
        gen_player(p, pos, q, 21, 23);
        p->pot = (u8)MIN(99, p->pot + rng_between(0, 10));
        p->team = TEAM_DRAFT;
        p->years = 0;
    }
    /* order: worst regular season record first, champion last */
    u8 order[NUM_TEAMS];
    for (int i = 0; i < NUM_TEAMS; i++)
        order[i] = (u8)i;
    int champ = playoff_winner(&c->playoff[6]);
    for (int i = 1; i < NUM_TEAMS; i++) {
        u8 v = order[i];
        int j = i - 1;
        while (j >= 0) {
            int a = order[j];
            int ka = c->ts[a].w * 2 + c->ts[a].t + (a == champ ? 100 : 0);
            int kv = c->ts[v].w * 2 + c->ts[v].t + (v == champ ? 100 : 0);
            if (ka > kv || (ka == kv && (c->ts[a].pf - c->ts[a].pa) > (c->ts[v].pf - c->ts[v].pa))) {
                order[j + 1] = order[j];
                j--;
            } else {
                break;
            }
        }
        order[j + 1] = v;
    }
    memcpy(c->draftOrder, order, NUM_TEAMS);
    c->draftPick = 0;
}

int off_draft_team(void)
{
    if (g_career.draftPick >= DRAFT_ROUNDS * NUM_TEAMS)
        return -1;
    return g_career.draftOrder[g_career.draftPick % NUM_TEAMS];
}

int off_draft_round(void)
{
    return g_career.draftPick / NUM_TEAMS + 1;
}

int off_draft_best_available(void)
{
    int best = -1, bv = -1;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        const Player *p = &g_career.players[i];
        if (p->team != TEAM_DRAFT)
            continue;
        int v = draft_value(p);
        if (v > bv) {
            bv = v;
            best = i;
        }
    }
    return best;
}

static void cut_worst(int team)
{
    int worst = -1, wo = 999;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        const Player *p = &g_career.players[i];
        if (p->team != team)
            continue;
        int o = player_ovr(p) + (team_pos_count(team, p->pos) <= pos_info[p->pos].starters ? 40 : 0);
        if (o < wo) {
            wo = o;
            worst = i;
        }
    }
    if (worst >= 0)
        league_release(worst);
}

int off_draft_pick(int pidx)
{
    Career *c = &g_career;
    int team = off_draft_team();
    if (team < 0)
        return -1;
    Player *p = &c->players[pidx];
    if (p->team != TEAM_DRAFT)
        return -1;
    if (team_count(team) >= ROSTER_MAX) {
        if (team == c->userTeam)
            return 1;
        cut_worst(team);
    }
    int sal = player_market_salary(p) * 60 / 100;
    if (sal < 5)
        sal = 5;
    if (c->draftPick < NUM_TEAMS)
        sal += 5;
    p->team = (u8)team;
    p->salary = (u16)sal;
    p->years = 3;
    p->flags |= PF_ROOKIE;
    p->number = (u8)team_pick_number(team, p->pos);
    if (team == c->userTeam) {
        p->flags |= PF_DRAFTED;
        p->pot = (u8)MIN(99, p->pot + c->fac[FAC_SCOUTING] * 2);
    }
    c->draftPick++;
    return 0;
}

void off_draft_ai_pick(void)
{
    int team = off_draft_team();
    if (team < 0)
        return;
    int best = -1, bv = -1;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        const Player *p = &g_career.players[i];
        if (p->team != TEAM_DRAFT)
            continue;
        int v = draft_value(p) + rng_between(0, 4);
        if (team_pos_count(team, p->pos) < pos_info[p->pos].starters + 1)
            v += 6;
        if (p->pos == POS_K && team_pos_count(team, POS_K) >= 1)
            v -= 20;
        if (v > bv) {
            bv = v;
            best = i;
        }
    }
    if (best >= 0)
        off_draft_pick(best);
    else
        g_career.draftPick++;
}

void off_draft_finish(void)
{
    Career *c = &g_career;
    /* undrafted: the best become free agents */
    int kept = 0;
    for (int pass = 0; pass < 2; pass++) {
        for (int i = 0; i < MAX_PLAYERS; i++) {
            Player *p = &c->players[i];
            if (p->team != TEAM_DRAFT)
                continue;
            if (pass == 0 && p->pot >= 70 && kept < 8) {
                p->team = TEAM_FA;
                kept++;
            } else if (pass == 1) {
                p->team = TEAM_NONE;
            }
        }
    }
    c->offStage = OFF_FREEAGENCY;
}

/* ---------------- free agency ---------------- */

static int best_fa_for(int team, int pos, int maxSalary)
{
    int best = -1, bo = -1;
    for (int i = 0; i < MAX_PLAYERS; i++) {
        const Player *p = &g_career.players[i];
        if (p->team != TEAM_FA || (pos >= 0 && p->pos != pos))
            continue;
        if (player_market_salary(p) > maxSalary)
            continue;
        int o = player_ovr(p);
        if (o > bo) {
            bo = o;
            best = i;
        }
    }
    (void)team;
    return best;
}

void ai_fill_rosters(void)
{
    Career *c = &g_career;
    for (int t = 0; t < NUM_TEAMS; t++) {
        if (t == c->userTeam)
            continue;
        /* fill missing starters first, then depth */
        for (int pass = 0; pass < 2; pass++) {
            for (int pos = 0; pos < NUM_POS; pos++) {
                int need = pos_info[pos].starters + (pass == 1 && pos != POS_K ? 1 : 0);
                while (team_pos_count(t, pos) < need && team_count(t) < ROSTER_MAX - 1) {
                    int room = team_cap_room(t);
                    int f = best_fa_for(t, pos, room);
                    if (f < 0)
                        break;
                    Player *p = &c->players[f];
                    league_sign(f, t, player_market_salary(p), rng_between(1, 3));
                }
            }
        }
    }
}

static void top_up_fa_pool(void)
{
    int n = 0;
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (g_career.players[i].team == TEAM_FA)
            n++;
    if (n < 36)
        league_gen_fa(36 - n);
}

void off_fa_ai(void)
{
    ai_fill_rosters();
    top_up_fa_pool();
}

void off_new_season(void)
{
    Career *c = &g_career;
    ai_fill_rosters();
    /* trim FA pool: very old or weak free agents leave the league */
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &c->players[i];
        if (p->team == TEAM_FA && (p->age >= 34 || player_ovr(p) < 35))
            p->team = TEAM_NONE;
    }
    top_up_fa_pool();
    c->year++;
    c->seasonNum++;
    c->phase = PH_REGULAR;
    c->week = 0;
    c->offStage = OFF_RECAP;
    c->userEliminated = 0;
    for (int t = 0; t < NUM_TEAMS; t++) {
        TeamSeason *ts = &c->ts[t];
        u8 m = ts->morale, ch = ts->chem;
        memset(ts, 0, sizeof(*ts));
        ts->morale = (u8)(50 + (m - 50) / 2);
        ts->chem = (u8)(ch * 3 / 4);
    }
    memset(&c->stats, 0, sizeof(c->stats));
    memset(c->seeds, TEAM_NONE, sizeof(c->seeds));
    season_new_schedule();
}
