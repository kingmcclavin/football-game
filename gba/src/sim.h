/* Statistical play simulator: drives the opponent's possessions during the
 * user's games and every game the user doesn't play. */
#ifndef SIM_H
#define SIM_H

#include "types.h"
#include "rules.h"
#include "league.h"

enum { DC_BALANCED, DC_BLITZ, DC_PREVENT, DC_RUNSTOP, NUM_DEF_CALLS };
extern const char *const def_call_names[NUM_DEF_CALLS];
extern const char *const def_call_desc[NUM_DEF_CALLS];

typedef struct {
    u16 passYds, rushYds;
    u8 passTD, rushTD, ints, fumbles, sacks, fgm, fga, plays;
} SideStats;

/* Choose and resolve one play for side gs->poss. `off`/`def` are the
 * strengths of the offense and the defense. Fills r and a short
 * description. Does NOT apply the result (call gs_apply_play). */
void sim_play(GameState *gs, const TeamStrength *off, const TeamStrength *def,
              int defCall, PlayResult *r, char *desc, SideStats *st);

/* Simulate an entire game. Returns scores via hs/as. */
void sim_game(int home, int away, int allowTie, int *hs, int *as, SideStats *st);

/* Probability (percent) a kick of `dist` yards is good for a kicker. */
int fg_chance(int dist, int kick);

#endif
