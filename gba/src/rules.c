#include "rules.h"
#include "rng.h"
#include <string.h>

static void set_first_down(GameState *gs)
{
    gs->down = 1;
    gs->dist = (u8)MIN(10, 100 - gs->ballOn);
}

static void change_possession(GameState *gs, int ballOn)
{
    gs->poss ^= 1;
    gs->ballOn = (s16)CLAMP(ballOn, 1, 99);
    set_first_down(gs);
    gs->plays = 0;
    gs->driveStart = gs->ballOn;
}

void gs_init(GameState *gs, int quarterSeconds, int allowTie, int firstReceiver)
{
    memset(gs, 0, sizeof(*gs));
    gs->quarter = 1;
    gs->qlen = (s16)quarterSeconds;
    gs->clock = (s16)quarterSeconds;
    gs->allowTie = (u8)allowTie;
    gs->firstReceiver = (u8)firstReceiver;
    gs_kickoff(gs, firstReceiver);
}

u32 gs_kickoff(GameState *gs, int receiver)
{
    u32 ev = EV_KICKOFF;
    gs->poss = (u8)receiver;
    gs->conversion = 0;
    if (rng_chance(55)) {
        gs->ballOn = 25;
        gs->lastKickRet = 0;
        ev |= EV_TOUCHBACK;
    } else {
        int spot = rng_chance(4) ? rng_between(40, 62) : rng_between(14, 36);
        gs->ballOn = (s16)spot;
        gs->lastKickRet = (u8)(spot + 3);
        if (gs->clock > 6)
            gs->clock -= 5;
    }
    set_first_down(gs);
    gs->plays = 0;
    gs->driveStart = gs->ballOn;
    return ev;
}

/* Returns 1 if possession was set by the quarter change (halftime, OT, end). */
static int end_quarter(GameState *gs, u32 *ev)
{
    int q = gs->quarter;
    gs->pendingQuarterEnd = 0;
    gs->twoMinWarned = 0;
    if (q == 1 || q == 3) {
        gs->quarter++;
        gs->clock = gs->qlen;
        *ev |= EV_END_QUARTER;
        return 0;
    }
    if (q == 2) {
        gs->quarter = 3;
        gs->clock = gs->qlen;
        *ev |= EV_HALFTIME | gs_kickoff(gs, gs->firstReceiver ^ 1);
        return 1;
    }
    if (gs->score[0] != gs->score[1] || (q >= 5 && gs->allowTie)) {
        gs->over = 1;
        gs->clock = 0;
        *ev |= EV_GAMEOVER;
        return 1;
    }
    gs->quarter++;
    gs->clock = gs->qlen;
    *ev |= EV_OT | gs_kickoff(gs, rng_range(2));
    return 1;
}

static int sudden_death(GameState *gs, u32 *ev)
{
    if (gs->quarter >= 5 && gs->score[0] != gs->score[1]) {
        gs->over = 1;
        gs->conversion = 0;
        *ev |= EV_GAMEOVER;
        return 1;
    }
    return 0;
}

u32 gs_apply_play(GameState *gs, const PlayResult *r)
{
    u32 ev = 0;
    int offense = gs->poss;
    int other = offense ^ 1;
    int kickTo = -1;
    int clockRuns = 0;
    int elapsed = r->seconds;

    if (gs->over)
        return EV_GAMEOVER;

    if (gs->conversion) {
        gs->conversion = 0;
        if (r->good) {
            gs->score[offense] += (r->type == PT_XP) ? 1 : 2;
            ev |= EV_TRY_GOOD;
        } else {
            ev |= EV_MISS;
        }
        kickTo = other;
        elapsed = 0;
    } else {
        gs->plays++;
        switch (r->type) {
        case PT_RUN:
        case PT_PASS:
        case PT_SACK:
        case PT_KNEEL: {
            int spot = gs->ballOn + r->yards;
            if (spot >= 100) {
                gs->score[offense] += 6;
                ev |= EV_TD;
                if (sudden_death(gs, &ev))
                    return ev;
                gs->conversion = 1;
                gs->ballOn = 98;
                gs->down = 1;
                gs->dist = 2;
                ev |= EV_CONVERSION;
            } else if (spot <= 0) {
                gs->score[other] += 2;
                ev |= EV_SAFETY;
                if (sudden_death(gs, &ev))
                    return ev;
                kickTo = other;
            } else {
                gs->ballOn = (s16)spot;
                if (r->yards >= gs->dist) {
                    set_first_down(gs);
                    ev |= EV_FIRSTDOWN;
                    clockRuns = !r->oob;
                } else {
                    gs->down++;
                    gs->dist = (u8)(gs->dist - r->yards);
                    if (gs->down > 4) {
                        change_possession(gs, 100 - spot);
                        ev |= EV_DOWNS | EV_TURNOVER;
                    } else {
                        clockRuns = !r->oob;
                    }
                }
            }
            break;
        }
        case PT_INCOMPLETE:
            gs->down++;
            if (gs->down > 4) {
                change_possession(gs, 100 - gs->ballOn);
                ev |= EV_DOWNS | EV_TURNOVER;
            }
            break;
        case PT_INT:
        case PT_FUMBLE: {
            int spot = gs->ballOn + r->yards;
            int fin = spot - r->retYards;
            ev |= EV_TURNOVER;
            if (fin <= 0) {
                gs->score[other] += 6;
                ev |= EV_TD | EV_DEF_TD;
                gs->poss = (u8)other;
                if (sudden_death(gs, &ev))
                    return ev;
                gs->conversion = 1;
                gs->ballOn = 98;
                gs->down = 1;
                gs->dist = 2;
                ev |= EV_CONVERSION;
            } else if (fin >= 100) {
                change_possession(gs, 20);
                ev |= EV_TOUCHBACK;
            } else {
                change_possession(gs, 100 - fin);
            }
            break;
        }
        case PT_PUNT: {
            int landing = gs->ballOn + r->yards;
            ev |= EV_PUNT;
            if (landing >= 100) {
                change_possession(gs, 20);
                ev |= EV_TOUCHBACK;
            } else {
                int fin = landing - r->retYards;
                change_possession(gs, 100 - CLAMP(fin, 1, 99));
            }
            break;
        }
        case PT_FG:
            if (r->good) {
                gs->score[offense] += 3;
                ev |= EV_FG_GOOD;
                if (sudden_death(gs, &ev))
                    return ev;
                kickTo = other;
            } else {
                ev |= EV_MISS;
                change_possession(gs, MAX(20, 100 - (gs->ballOn - 7)));
            }
            break;
        default:
            break;
        }
    }

    if (clockRuns) {
        int h = gs->hurry[offense];
        elapsed += (h == 1) ? 8 : (h == 2 ? 36 : 18);
    }

    int handled = 0;
    if (elapsed > 0) {
        int before = gs->clock;
        gs->clock -= elapsed;
        if ((gs->quarter == 2 || gs->quarter == 4) && before > 120 && gs->clock <= 120 && !gs->twoMinWarned) {
            if (gs->clock > 0)
                gs->clock = 120;
            gs->twoMinWarned = 1;
            ev |= EV_TWO_MIN;
        }
        if (gs->clock <= 0) {
            gs->clock = 0;
            if (gs->conversion)
                gs->pendingQuarterEnd = 1;
            else
                handled = end_quarter(gs, &ev);
        }
    } else if (gs->pendingQuarterEnd && !gs->conversion) {
        handled = end_quarter(gs, &ev);
    }

    if (!handled && kickTo >= 0 && !gs->over)
        ev |= gs_kickoff(gs, kickTo);
    return ev;
}

int gs_fg_distance(const GameState *gs)
{
    return 100 - gs->ballOn + 17;
}

const char *gs_down_str(int down)
{
    static const char *const s[] = {"", "1ST", "2ND", "3RD", "4TH"};
    return s[CLAMP(down, 0, 4)];
}
