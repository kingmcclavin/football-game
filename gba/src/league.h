/* Career / league data model. Everything in Career is saved to SRAM. */
#ifndef LEAGUE_H
#define LEAGUE_H

#include "types.h"
#include "data.h"

#define ROSTER_MAX 24
#define ROSTER_MIN 19
#define TEAM_FA 16
#define TEAM_DRAFT 17
#define TEAM_NONE 0xFF
#define MAX_PLAYERS 480
#define NUM_WEEKS 15
#define GAMES_PER_WEEK 8
#define NUM_PLAYOFF_GAMES 7
#define MAX_HISTORY 40
#define SALARY_CAP 900 /* in $100K units: $90.0M */
#define LINEUP_SLOTS 19
#define DRAFT_ROUNDS 2
#define DRAFT_CLASS 40
#define UNPLAYED 0xFF
#define MAX_FAC_LEVEL 5

/* Player flags */
#define PF_ROOKIE 0x01
#define PF_TRAINED 0x02  /* trained since last game */
#define PF_DRAFTED 0x04  /* drafted by the user's team */
#define PF_RETIRING 0x08 /* announced retirement (offseason) */

typedef struct {
    u8 team;   /* 0-15, TEAM_FA, TEAM_DRAFT or TEAM_NONE (free slot) */
    u8 pos;
    u8 first, last;
    u8 age;
    u8 pot;    /* potential: attribute ceiling */
    u8 injury; /* weeks out */
    u8 years;  /* contract years left (incl. current season) */
    u8 attr[4];
    u16 salary; /* $100K units */
    u8 number;
    u8 flags;
} Player;

typedef struct {
    u8 home, away;
    u8 hs, as; /* hs == UNPLAYED until played */
} GameRec;

typedef struct {
    u8 w, l, t;
    u8 streak; /* bit7 set = losing streak, low bits = length */
    u16 pf, pa;
    u8 morale; /* 0-100 */
    u8 chem;   /* 0-100 */
} TeamSeason;

enum { FIN_MISSED, FIN_ROUND1, FIN_CONF, FIN_FINAL, FIN_CHAMP };

typedef struct {
    u16 year;
    u8 champ, runnerUp;
    u8 userW, userL, userT, userFinish;
} HistEntry;

typedef struct {
    u16 passYds, rushYds, recYds;
    u8 passTD, rushTD, ints, fumbles;
    u8 sacksAllowed, fgMade, fgAtt, pad;
} SeasonStats;

enum { PH_REGULAR, PH_PLAYOFFS, PH_OFFSEASON };

enum { OFF_RECAP, OFF_PROGRESS, OFF_RESIGN, OFF_DRAFT, OFF_FREEAGENCY, OFF_DONE };

enum { FAC_TRAINING, FAC_REHAB, FAC_SCOUTING, FAC_STADIUM, NUM_FAC };

enum { DIFF_ROOKIE, DIFF_PRO, DIFF_LEGEND };

typedef struct {
    u32 magic;
    u16 version;
    u16 size;
    u32 saveCount;

    /* settings */
    u8 userTeam;
    u8 difficulty;
    u8 quarterMin;
    u8 soundOn;
    char coachName[12];

    /* season state */
    u16 year;
    u8 seasonNum;   /* 1-based season of this career */
    u8 phase;
    u8 week;        /* regular season week 0..14, or playoff round 0..2 */
    u8 offStage;
    u8 draftPick;   /* overall pick index during the draft */
    u8 userEliminated;
    u8 draftOrder[NUM_TEAMS];

    Player players[MAX_PLAYERS];
    TeamSeason ts[NUM_TEAMS];
    GameRec sched[NUM_WEEKS][GAMES_PER_WEEK];
    GameRec playoff[NUM_PLAYOFF_GAMES];
    u8 seeds[2][4];

    /* team management */
    u8 fac[NUM_FAC];
    u16 coachPoints;

    /* coaching career */
    u16 careerW, careerL, careerT;
    u16 playoffW, playoffL;
    u8 titles, playoffApps, reputation, bestWins;
    u8 numHist;
    u8 pad[3];
    HistEntry hist[MAX_HISTORY];

    SeasonStats stats;      /* user team, current season */
    u32 careerPassYds, careerRushYds;
    u16 careerTDs, pad2;

    u32 rngState;
    u32 checksum;
} Career;

extern Career g_career;

/* Lineup: player index per slot, or -1 for a generic reserve. */
enum {
    SL_QB, SL_RB, SL_WR1, SL_WR2, SL_TE, SL_OL1, SL_OL2, SL_OL3, SL_OL4, SL_K,
    SL_DL1, SL_DL2, SL_DL3, SL_LB1, SL_LB2, SL_DB1, SL_DB2, SL_DB3, SL_DB4
};
extern const u8 slot_pos[LINEUP_SLOTS];

typedef struct {
    s16 idx[LINEUP_SLOTS];
} Lineup;

typedef struct {
    s16 passOff, runOff, passDef, runDef, kick;
    s16 qbAcc, qbArm;
} TeamStrength;

/* ---- players ---- */
int player_ovr(const Player *p);
int player_attr(int idx, int a); /* idx may be -1 for a reserve */
int player_market_salary(const Player *p);
void player_short_name(const Player *p, char *out); /* "J. Smith" */
void player_full_name(const Player *p, char *out);
const char *player_last_name(const Player *p);
int player_stars(const Player *p); /* potential stars 1-5 */
void gen_player(Player *p, int pos, int quality, int ageMin, int ageMax);
int alloc_player(void);

/* ---- teams ---- */
void team_lineup(int team, Lineup *lu);
void team_strength(int team, TeamStrength *ts, int homeBonus);
int team_payroll(int team);
int team_count(int team);
int team_pos_count(int team, int pos);
int team_ovr(int team);
int team_off_ovr(int team);
int team_def_ovr(int team);
int team_roster(int team, s16 *out, int max); /* sorted by position then ovr */
int team_cap_room(int team);
int team_used_numbers_has(int team, int num);
int team_pick_number(int team, int pos);

/* ---- league ---- */
void league_gen_fa(int count);
void league_new(int userTeam, int difficulty, const char *coachName, u32 seed);
int league_sign(int pidx, int team, int salary, int years);
void league_release(int pidx);
int fa_asking_salary(const Player *p);
int fa_willing(const Player *p);
int train_cost(const Player *p);
int train_player(int pidx);
int facility_cost(int fac);

#endif
