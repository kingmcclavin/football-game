/* Season: schedule, results, standings, playoffs, weekly upkeep. */
#ifndef SEASON_H
#define SEASON_H

#include "league.h"

void season_new_schedule(void);
/* The user's game this week / playoff round, or NULL (eliminated). */
GameRec *season_user_game(void);
int season_user_is_home(const GameRec *g);
/* Record a result. `simInjuries`: roll random injuries for both teams. */
void season_record(GameRec *g, int hs, int as, int simInjuries);
/* Simulate all remaining games this week/round except the user's. */
void season_sim_others(void);
/* Simulate the user's own game (the SIMULATE option). */
void season_sim_user(void);
/* All games of the current week/round are played? */
int season_week_done(void);
/* Weekly upkeep and move to the next week / round / offseason. */
void season_advance(void);
/* Sort a conference's teams by standings. Returns count (8). */
int standings_sorted(int conf, u8 *out);
int team_conf(int team);
/* Games for a playoff round: first index and count. */
int playoff_first(int round);
int playoff_count(int round);
int season_games_this_week(GameRec **out);
void season_week_label(char *buf);
void team_record_str(int team, char *buf);
int user_seed(void); /* 1-4 or 0 */
int playoff_winner(const GameRec *g);

#endif
