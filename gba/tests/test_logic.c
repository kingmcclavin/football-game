/* Host-side tests for the league, rules, simulator and save logic.
 * Build & run: make test */
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../src/league.h"
#include "../src/season.h"
#include "../src/offseason.h"
#include "../src/sim.h"
#include "../src/rules.h"
#include "../src/save.h"
#include "../src/rng.h"

static int failures = 0;
#define CHECK(cond, ...) do { if (!(cond)) { failures++; printf("FAIL %s:%d: ", __FILE__, __LINE__); printf(__VA_ARGS__); printf("\n"); } } while (0)

static void check_invariants(const char *where)
{
    for (int t = 0; t < NUM_TEAMS; t++) {
        int n = team_count(t);
        CHECK(n <= ROSTER_MAX, "%s: team %d roster %d > max", where, t, n);
        CHECK(n >= 12, "%s: team %d roster too small %d", where, t, n);
    }
    int pay = team_payroll(g_career.userTeam);
    CHECK(pay <= SALARY_CAP + 60, "%s: user payroll %d over cap", where, pay);
    for (int i = 0; i < MAX_PLAYERS; i++) {
        Player *p = &g_career.players[i];
        if (p->team == TEAM_NONE) continue;
        CHECK(p->pos < NUM_POS, "%s: bad pos", where);
        CHECK(p->first < NUM_FIRST_NAMES && p->last < NUM_LAST_NAMES, "%s: bad name", where);
        for (int a = 0; a < 4; a++) CHECK(p->attr[a] <= 99, "%s: attr", where);
    }
}

static void test_rules(void)
{
    GameState gs;
    PlayResult r;
    rng_seed(7);
    gs_init(&gs, 240, 1, 0);
    CHECK(gs.poss == 0 && gs.down == 1, "kickoff");
    gs.ballOn = 50; gs.down = 1; gs.dist = 10;
    memset(&r, 0, sizeof r);
    r.type = PT_RUN; r.yards = 4; r.seconds = 5;
    u32 ev = gs_apply_play(&gs, &r);
    CHECK(gs.down == 2 && gs.dist == 6 && gs.ballOn == 54, "2nd and 6 (got %d&%d at %d)", gs.down, gs.dist, gs.ballOn);
    r.yards = 7;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_FIRSTDOWN) && gs.down == 1 && gs.dist == 10, "first down");
    r.yards = 50;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_TD) && gs.score[0] == 6 && gs.conversion, "touchdown");
    r.type = PT_XP; r.good = 1;
    ev = gs_apply_play(&gs, &r);
    CHECK(gs.score[0] == 7 && gs.poss == 1 && (ev & EV_KICKOFF), "xp + kickoff");
    /* turnover on downs */
    gs.ballOn = 30; gs.down = 4; gs.dist = 3;
    r.type = PT_INCOMPLETE; r.good = 0; r.yards = 0;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_DOWNS) && gs.poss == 0 && gs.ballOn == 70, "downs (poss %d ball %d)", gs.poss, gs.ballOn);
    /* safety */
    gs.ballOn = 2; gs.down = 1; gs.dist = 10;
    r.type = PT_SACK; r.yards = -5;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_SAFETY) && gs.score[1] == 2 && gs.poss == 1, "safety");
    /* interception */
    gs.poss = 0; gs.ballOn = 40; gs.down = 2; gs.dist = 10;
    r.type = PT_INT; r.yards = 20; r.retYards = 5;
    ev = gs_apply_play(&gs, &r);
    CHECK(gs.poss == 1 && gs.ballOn == 45, "int spot (got %d)", gs.ballOn);
    /* field goal */
    gs.poss = 0; gs.ballOn = 75; gs.down = 4;
    r.type = PT_FG; r.good = 1;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_FG_GOOD) && gs.score[0] == 10, "fg");
    /* halftime switches receiver */
    gs.quarter = 2; gs.clock = 3; gs.poss = 0; gs.ballOn = 30; gs.down = 1; gs.dist = 10;
    r.type = PT_RUN; r.yards = 2; r.seconds = 6; r.oob = 0;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_HALFTIME) && gs.quarter == 3 && gs.poss == 1, "halftime (q%d poss %d)", gs.quarter, gs.poss);
    /* end of game */
    gs.quarter = 4; gs.clock = 3;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_GAMEOVER) && gs.over, "game over");
    /* overtime when tied, sudden death */
    gs_init(&gs, 240, 0, 0);
    gs.quarter = 4; gs.clock = 2; gs.score[0] = gs.score[1] = 14;
    r.type = PT_RUN; r.yards = 1;
    ev = gs_apply_play(&gs, &r);
    CHECK((ev & EV_OT) && gs.quarter == 5 && !gs.over, "overtime");
    gs.poss = 1; gs.ballOn = 80; gs.down = 1; gs.dist = 10;
    r.type = PT_FG; r.good = 1;
    ev = gs_apply_play(&gs, &r);
    CHECK(gs.over && gs.score[1] == 17, "sudden death fg");
}

static void test_sim_distribution(void)
{
    rng_seed(99);
    league_new(0, DIFF_PRO, "TESTER", 12345);
    long tot = 0, n = 0, ties = 0, maxs = 0;
    for (int i = 0; i < 400; i++) {
        int hs, as;
        sim_game(i % 16, (i + 5) % 16, 1, &hs, &as, 0);
        tot += hs + as; n += 2;
        if (hs == as) ties++;
        if (hs > maxs) maxs = hs;
        if (as > maxs) maxs = as;
    }
    printf("sim: avg points per team %.1f, ties %ld/400, max %ld\n", (double)tot / n, ties, maxs);
    CHECK(tot / n >= 10 && tot / n <= 35, "average score plausible");
    CHECK(ties < 40, "too many ties");
}

static void run_season(int verbose)
{
    Career *c = &g_career;
    while (c->phase != PH_OFFSEASON) {
        season_sim_user();
        season_sim_others();
        CHECK(season_week_done(), "week done");
        season_advance();
    }
    CHECK(c->offStage == OFF_RECAP, "offseason recap");
    if (verbose) {
        u8 st[8];
        for (int conf = 0; conf < 2; conf++) {
            standings_sorted(conf, st);
            printf("  %s:", conf_names[conf]);
            for (int i = 0; i < 8; i++) printf(" %s %d-%d", team_info[st[i]].abbr, c->ts[st[i]].w, c->ts[st[i]].l);
            printf("\n");
        }
        int ch = playoff_winner(&c->playoff[6]);
        printf("  champion: %s, user finish %d, rep %d, CP %d\n", team_info[ch].abbr, c->hist[c->numHist-1].userFinish, c->reputation, c->coachPoints);
    }
    off_progress();
    CHECK(c->offStage == OFF_RESIGN, "resign stage");
    /* user re-signs everyone they can */
    for (int i = 0; i < MAX_PLAYERS; i++)
        if (c->players[i].team == c->userTeam && c->players[i].years == 0)
            off_resign(i);
    off_resign_finish();
    off_draft_begin();
    int picks = 0;
    while (off_draft_team() >= 0) {
        if (off_draft_team() == c->userTeam) {
            int b = off_draft_best_available();
            if (off_draft_pick(b) != 0) c->draftPick++;
        } else off_draft_ai_pick();
        picks++;
        CHECK(picks <= 40, "draft terminates");
        if (picks > 40) break;
    }
    off_draft_finish();
    off_fa_ai();
    off_new_season();
    check_invariants("new season");
}

static void test_career(void)
{
    league_new(3, DIFF_PRO, "COACH", 4242);
    check_invariants("new league");
    for (int s = 0; s < 12; s++) {
        printf("season %d (%d):\n", s + 1, g_career.year);
        run_season(1);
    }
    int used = 0;
    for (int i = 0; i < MAX_PLAYERS; i++) if (g_career.players[i].team != TEAM_NONE) used++;
    printf("players in use after 12 seasons: %d / %d, history %d\n", used, MAX_PLAYERS, g_career.numHist);
    CHECK(used < MAX_PLAYERS - 20, "player pool not exhausted");
    CHECK(g_career.numHist == 12, "history recorded");
    int t0 = 0;
    for (int t = 0; t < NUM_TEAMS; t++) t0 += team_ovr(t);
    printf("avg team ovr: %d\n", t0 / NUM_TEAMS);
}

static void test_save(void)
{
    league_new(5, DIFF_ROOKIE, "SAVER", 777);
    run_season(0);
    CHECK(!save_exists() || 1, "");
    save_erase();
    CHECK(!save_exists(), "erased");
    CHECK(save_write(), "write");
    CHECK(save_exists(), "exists after write");
    static Career copy;
    memcpy(&copy, &g_career, sizeof copy);
    memset(&g_career, 0, sizeof g_career);
    CHECK(save_load(), "load");
    CHECK(memcmp(&copy, &g_career, sizeof copy) == 0, "roundtrip identical");
    /* corrupt one slot: the other must still load */
    extern u8 host_sram[];
    host_sram[100] ^= 0xFF;
    memset(&g_career, 0, sizeof g_career);
    CHECK(save_load(), "load with one corrupt slot");
    CHECK(g_career.userTeam == 5, "loaded data");
    printf("save size: %u bytes per slot\n", (unsigned)sizeof(Career));
}

int main(void)
{
    test_rules();
    test_sim_distribution();
    test_career();
    test_save();
    if (failures) { printf("%d FAILURES\n", failures); return 1; }
    printf("ALL TESTS PASSED\n");
    return 0;
}
