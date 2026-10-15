#include "sim.h"
#include "rng.h"
#include "util.h"

const char *const def_call_names[NUM_DEF_CALLS] = {"BALANCED", "BLITZ", "PREVENT", "RUN STOP"};
const char *const def_call_desc[NUM_DEF_CALLS] = {
    "No weakness, no edge.",
    "More sacks & picks, big plays.",
    "Stops the deep ball.",
    "Stuffs the run.",
};

int fg_chance(int dist, int kick)
{
    int p;
    if (dist <= 25)
        p = 98;
    else if (dist <= 60)
        p = 98 - (dist - 25) * (dist - 25) / 18 - (dist - 25);
    else
        p = 2;
    p += (kick - 70) / 2;
    return CLAMP(p, 2, 99);
}

static void set_hurry(GameState *gs, int side)
{
    int diff = gs->score[side] - gs->score[side ^ 1];
    gs->hurry[side] = 0;
    if ((gs->quarter == 2 || gs->quarter >= 4) && gs->clock <= 150 && (diff <= 0 || gs->quarter == 2))
        gs->hurry[side] = 1;
    if (gs->quarter >= 4 && diff > 0 && gs->clock <= 360)
        gs->hurry[side] = 2;
}

static int is_late_trailing(const GameState *gs, int side, int byMoreThan)
{
    int diff = gs->score[side] - gs->score[side ^ 1];
    return gs->quarter >= 4 && gs->clock <= 240 && diff < -byMoreThan;
}

void sim_play(GameState *gs, const TeamStrength *off, const TeamStrength *def,
              int defCall, PlayResult *r, char *desc, SideStats *st)
{
    int side = gs->poss;
    SideStats *s = st ? &st[side] : 0;
    r->type = PT_RUN;
    r->yards = 0;
    r->retYards = 0;
    r->good = 0;
    r->oob = 0;
    r->seconds = 6;
    set_hurry(gs, side);

    /* ---- try after touchdown ---- */
    if (gs->conversion) {
        int diff = gs->score[side] - gs->score[side ^ 1];
        int goTwo = gs->quarter >= 4 && gs->clock < 420 && (diff == -2 || diff == -5 || diff == 1 || diff == -10);
        if (goTwo) {
            r->type = PT_TWO;
            r->good = (u8)rng_chance(CLAMP(46 + (off->passOff - def->passDef) / 2, 25, 70));
            fmt(desc, "2PT %s", r->good ? "GOOD" : "FAILS");
        } else {
            r->type = PT_XP;
            r->good = (u8)rng_chance(fg_chance(33, off->kick));
            fmt(desc, "XP %s", r->good ? "GOOD" : "NO GOOD");
        }
        r->seconds = 0;
        return;
    }

    int toGo = 100 - gs->ballOn;
    int fgDist = toGo + 17;
    int diff = gs->score[side] - gs->score[side ^ 1];
    int lastPlay = (gs->quarter == 2 || gs->quarter >= 4) && gs->clock <= 8;

    /* end-of-half field goal */
    if (lastPlay && fgDist <= 58 && (gs->quarter == 2 || (diff >= -3 && diff <= 0))) {
        goto field_goal;
    }
    /* kneel to end the game */
    if (gs->quarter >= 4 && diff > 0 && gs->clock <= 40 * (5 - gs->down) && gs->hurry[side] == 2) {
        r->type = PT_KNEEL;
        r->yards = -1;
        r->seconds = 3;
        fmt(desc, "QB KNEELS");
        return;
    }

    /* ---- fourth down decisions ---- */
    if (gs->down == 4) {
        int goForIt = 0;
        if (is_late_trailing(gs, side, 3) || (is_late_trailing(gs, side, 0) && fgDist > 52))
            goForIt = 1;
        else if (gs->dist <= 1 && gs->ballOn >= 45 && gs->ballOn < 70 && rng_chance(55))
            goForIt = 1;
        else if (gs->dist <= 2 && gs->ballOn >= 60 && fgDist > 50)
            goForIt = 1;
        if (!goForIt) {
            if (fgDist <= 54 && fg_chance(fgDist, off->kick) >= 45)
                goto field_goal;
            if (gs->ballOn < 60 || fgDist > 54) {
                int pdist = 36 + off->kick / 6 + rng_between(-7, 8);
                r->type = PT_PUNT;
                r->yards = (s8)pdist;
                r->retYards = (s8)(rng_chance(70) ? rng_between(0, 12) : 0);
                r->seconds = 8;
                if (gs->ballOn + pdist >= 100)
                    fmt(desc, "PUNT, TOUCHBACK");
                else
                    fmt(desc, "PUNT %d, RET %d", pdist, r->retYards);
                return;
            }
        }
    }

    /* ---- run or pass ---- */
    {
        int passPct = 52;
        if (gs->down >= 3 && gs->dist >= 7)
            passPct = 82;
        else if (gs->dist <= 2)
            passPct = 30;
        if (gs->hurry[side] == 1)
            passPct += 22;
        if (gs->hurry[side] == 2)
            passPct = 15;
        int isPass = rng_chance(passPct);
        int bigBonus = 0, compMod = 0, runMod = 0, sackMod = 0, intMod = 0;
        switch (defCall) {
        case DC_BLITZ: sackMod = 5; intMod = 8; bigBonus = 6; compMod = -4; break;
        case DC_PREVENT: bigBonus = -8; compMod = 7; runMod = 1; break;
        case DC_RUNSTOP: runMod = -2; compMod = 4; bigBonus = 2; break;
        default: break;
        }
        if (s)
            s->plays++;
        if (isPass) {
            int d = off->passOff - def->passDef;
            int sackP = CLAMP(6 - d / 6 + sackMod, 2, 18);
            int intP = CLAMP(24 - d + intMod * 10 / 4, 8, 80); /* per mille */
            if (rng_chance(sackP)) {
                int y = -rng_between(3, 9);
                r->type = PT_SACK;
                r->yards = (s8)y;
                r->seconds = 5;
                if (s)
                    s->sacks++;
                fmt(desc, "SACKED, %d", y);
                return;
            }
            if (rng_chance1000(intP)) {
                int air = rng_between(4, 25);
                r->type = PT_INT;
                r->yards = (s8)MIN(air, toGo + 5);
                r->retYards = (s8)(rng_chance(4) ? 99 : rng_between(0, 20));
                r->seconds = 7;
                if (s)
                    s->ints++;
                fmt(desc, "INTERCEPTED!");
                return;
            }
            int deep = rng_chance(gs->dist >= 12 || gs->hurry[side] ? 40 : 22);
            int comp = 68 + d / 2 + (off->qbAcc - 70) / 3 + compMod + (deep ? -18 : 8);
            comp = CLAMP(comp, 20, 90);
            if (!rng_chance(comp)) {
                r->type = PT_INCOMPLETE;
                r->seconds = 5;
                fmt(desc, deep ? "DEEP INCOMPLETE" : "INCOMPLETE");
                return;
            }
            int y;
            if (deep)
                y = rng_between(16, 38) + rng_between(0, 12);
            else
                y = rng_between(2, 11) + rng_between(0, 8);
            if (rng_chance(CLAMP(10 + d / 4 + bigBonus, 2, 24)))
                y += rng_between(12, 45);
            if (y > toGo)
                y = toGo;
            r->type = PT_PASS;
            r->yards = (s8)y;
            r->oob = (u8)(rng_chance(gs->hurry[side] == 1 ? 45 : 18));
            r->seconds = (u8)rng_between(5, 9);
            if (s) {
                s->passYds += (u16)y;
                if (y >= toGo)
                    s->passTD++;
            }
            if (y >= toGo)
                fmt(desc, "TD PASS! %d YDS", y);
            else
                fmt(desc, "PASS, %d YDS", y);
            return;
        } else {
            int d = off->runOff - def->runDef;
            int avg = 5 + d / 7 + runMod;
            if (avg < 1)
                avg = 1;
            int y = rng_between(-1, avg * 2);
            if (rng_chance(CLAMP(8 + d / 5 + bigBonus / 2, 2, 18)))
                y += rng_between(8, 50);
            if (y > toGo)
                y = toGo;
            if (rng_chance1000(12)) {
                r->type = PT_FUMBLE;
                r->yards = (s8)MAX(y, 0);
                r->retYards = (s8)rng_between(0, 6);
                r->seconds = 6;
                if (s)
                    s->fumbles++;
                fmt(desc, "FUMBLE LOST!");
                return;
            }
            r->type = PT_RUN;
            r->yards = (s8)y;
            r->oob = (u8)rng_chance(10);
            r->seconds = (u8)rng_between(4, 7);
            if (s) {
                s->rushYds += (u16)(y > 0 ? y : 0);
                if (y >= toGo)
                    s->rushTD++;
            }
            if (y >= toGo)
                fmt(desc, "TD RUN! %d YDS", y);
            else if (y < 0)
                fmt(desc, "RUN STUFFED, %d", y);
            else
                fmt(desc, "RUN, %d YDS", y);
            return;
        }
    }

field_goal:
    r->type = PT_FG;
    r->good = (u8)rng_chance(fg_chance(fgDist, off->kick));
    r->seconds = 5;
    if (s) {
        s->fga++;
        if (r->good)
            s->fgm++;
    }
    fmt(desc, "%d YD FG %s", fgDist, r->good ? "GOOD" : "NO GOOD");
}

void sim_game(int home, int away, int allowTie, int *hs, int *as, SideStats *st)
{
    TeamStrength str[2];
    GameState gs;
    char desc[40];
    PlayResult r;
    team_strength(home, &str[0], 2);
    team_strength(away, &str[1], 0);
    gs_init(&gs, g_career.quarterMin ? g_career.quarterMin * 60 : 240, allowTie, rng_range(2));
    for (int guard = 0; guard < 600 && !gs.over; guard++) {
        int o = gs.poss;
        int dc = rng_range(NUM_DEF_CALLS);
        sim_play(&gs, &str[o], &str[o ^ 1], dc, &r, desc, st);
        gs_apply_play(&gs, &r);
    }
    if (!allowTie && gs.score[0] == gs.score[1])
        gs.score[rng_range(2)] += 3; /* safety net: playoff games need a winner */
    *hs = gs.score[0];
    *as = gs.score[1];
}
