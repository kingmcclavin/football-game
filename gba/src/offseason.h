/* Offseason: season recap, aging/progression/retirement, contracts,
 * draft, free agency and the start of a new season. */
#ifndef OFFSEASON_H
#define OFFSEASON_H

#include "league.h"

typedef struct {
    s16 idx;
    u8 oldOvr, newOvr;
    u8 retired;
    u8 age;
    u8 pos;
    u8 first, last;
} ChangeInfo;

#define MAX_CHANGES 32
extern ChangeInfo off_changes[MAX_CHANGES];
extern int off_num_changes;
extern int off_league_retired;

/* After the championship: history, reputation, coach points. */
void off_begin(void);
/* Aging, progression, retirement, contract countdown. Fills off_changes
 * with the user's roster changes. Advances to OFF_RESIGN. */
void off_progress(void);
/* Player's re-sign demand (salary, years). */
int off_resign_salary(const Player *p);
int off_resign_years(const Player *p);
/* 0 ok, 2 over cap, 4 refuses */
int off_resign(int pidx);
int off_resign_refuses(const Player *p);
/* AI teams decide; user's unsigned expiring players leave. -> OFF_DRAFT */
void off_resign_finish(void);
/* Draft */
void off_draft_begin(void);
int off_draft_team(void);            /* team on the clock or -1 if done */
int off_draft_round(void);
void off_draft_ai_pick(void);
int off_draft_pick(int pidx);       /* by the team on the clock */
void off_draft_finish(void);        /* -> OFF_FREEAGENCY */
int off_draft_best_available(void);
/* Free agency */
void off_fa_ai(void);               /* AI signings */
void off_new_season(void);
void ai_fill_rosters(void);

#endif
