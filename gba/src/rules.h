/* Football rules shared by the interactive match and the simulator:
 * downs, distance, scoring, possession, kickoffs, clock and overtime. */
#ifndef RULES_H
#define RULES_H

#include "types.h"

enum {
    PT_RUN,        /* run or completed pass / scramble: yards gained */
    PT_PASS,       /* completed pass */
    PT_INCOMPLETE,
    PT_SACK,
    PT_INT,        /* yards = spot of interception relative to LOS, retYards = return */
    PT_FUMBLE,     /* fumble lost: yards to spot, retYards = return */
    PT_PUNT,       /* yards = punt distance, retYards = return */
    PT_FG,         /* good = 1/0 */
    PT_XP,         /* good = 1/0 */
    PT_TWO,        /* good = 1/0 (2-point try, any play type) */
    PT_KNEEL,
};

typedef struct {
    u8 type;
    s8 yards;
    s8 retYards;
    u8 good;
    u8 oob;     /* ended out of bounds: clock stops */
    u8 seconds; /* duration of the play itself */
} PlayResult;

/* Event flags returned by gs_apply_play */
#define EV_FIRSTDOWN 0x0001
#define EV_TD 0x0002
#define EV_FG_GOOD 0x0004
#define EV_SAFETY 0x0008
#define EV_TURNOVER 0x0010
#define EV_DOWNS 0x0020
#define EV_END_QUARTER 0x0040
#define EV_HALFTIME 0x0080
#define EV_GAMEOVER 0x0100
#define EV_CONVERSION 0x0200
#define EV_KICKOFF 0x0400
#define EV_PUNT 0x0800
#define EV_TRY_GOOD 0x1000
#define EV_MISS 0x2000
#define EV_OT 0x4000
#define EV_DEF_TD 0x8000
#define EV_TOUCHBACK 0x10000
#define EV_TWO_MIN 0x20000

typedef struct {
    u8 score[2];
    u8 quarter;      /* 1-4, 5+ overtime */
    s16 clock;       /* seconds left in the quarter */
    s16 qlen;        /* seconds per quarter */
    u8 poss;         /* side with the ball (0 or 1) */
    s16 ballOn;      /* yards from the possessing side's own goal line */
    u8 down, dist;
    u8 conversion;   /* a try (XP / 2pt) is pending for poss */
    u8 firstReceiver;
    u8 allowTie;
    u8 over;
    u8 pendingQuarterEnd;
    u8 hurry[2];     /* hurry-up offense: shorter runoff */
    u8 twoMinWarned;
    u8 lastKickRet;  /* yards of last kickoff return, for display */
    u8 plays;        /* plays in the current drive */
    s16 driveStart;
} GameState;

void gs_init(GameState *gs, int quarterSeconds, int allowTie, int firstReceiver);
/* Kickoff to side `receiver`. Returns events (EV_KICKOFF | EV_TOUCHBACK). */
u32 gs_kickoff(GameState *gs, int receiver);
u32 gs_apply_play(GameState *gs, const PlayResult *r);
/* Called after the try (or when no try is needed) to kick off. */
int gs_fg_distance(const GameState *gs);
const char *gs_down_str(int down);

#endif
