#include "data.h"

/* Colours are 5-bit per channel (0-31). All teams are fictional. */
const TeamInfo team_info[NUM_TEAMS] = {
    /* Summit Conference */
    {"Bayport", "Barracudas", "BAY", 0, 19, 19, 31, 16, 0, 0, 1},
    {"Coldwater", "Moose", "CLD", 14, 8, 4, 29, 23, 5, 0, 0},
    {"Desert Springs", "Scorpions", "DSS", 4, 4, 5, 29, 25, 14, 1, 1},
    {"Eastfield", "Lumberjacks", "EFL", 24, 4, 4, 3, 3, 3, 0, 0},
    {"Granite Peak", "Goats", "GPG", 15, 16, 18, 5, 18, 8, 1, 1},
    {"Harbor City", "Haulers", "HCH", 3, 5, 14, 31, 26, 5, 0, 0},
    {"Ironton", "Forge", "IRN", 8, 8, 9, 30, 14, 2, 1, 1},
    {"Jade Valley", "Dragons", "JVD", 2, 16, 10, 28, 23, 4, 0, 1},
    /* Coast Conference */
    {"Kingsbury", "Crowns", "KBC", 11, 5, 19, 30, 25, 7, 1, 0},
    {"Lakeshore", "Loons", "LSL", 4, 11, 25, 30, 30, 30, 0, 0},
    {"Midland", "Twisters", "MDT", 21, 21, 23, 25, 3, 5, 0, 1},
    {"Northpoint", "Yetis", "NPY", 29, 29, 31, 12, 21, 29, 1, 0},
    {"Pine Ridge", "Owls", "PRO", 4, 12, 5, 19, 12, 6, 0, 1},
    {"Redrock", "Rattlers", "RRR", 25, 9, 4, 27, 23, 17, 0, 0},
    {"Silver Bay", "Stingrays", "SBS", 10, 21, 29, 3, 4, 10, 1, 1},
    {"Plainsview", "Bison", "PVB", 15, 3, 5, 30, 27, 22, 0, 0},
};

const char *const conf_names[2] = {"SUMMIT", "COAST"};

const PosInfo pos_info[NUM_POS] = {
    /* abbr  name               attributes                    weights        sal% gen st */
    {"QB", "Quarterback", {"ARM", "ACC", "SPD", "AWR"}, {4, 7, 1, 4}, 160, 2, 1},
    {"RB", "Running Back", {"SPD", "AGI", "STR", "HND"}, {6, 4, 3, 3}, 90, 2, 1},
    {"WR", "Wide Receiver", {"SPD", "CTH", "RTE", "AGI"}, {5, 5, 4, 2}, 105, 3, 2},
    {"TE", "Tight End", {"SPD", "CTH", "BLK", "STR"}, {3, 5, 5, 3}, 85, 1, 1},
    {"OL", "Offensive Line", {"PBK", "RBK", "STR", "SPD"}, {6, 6, 3, 1}, 80, 4, 4},
    {"DL", "Defensive Line", {"PRS", "RST", "STR", "SPD"}, {6, 5, 3, 2}, 95, 3, 3},
    {"LB", "Linebacker", {"TKL", "COV", "SPD", "PRS"}, {6, 4, 4, 2}, 90, 2, 2},
    {"DB", "Defensive Back", {"COV", "SPD", "TKL", "CTH"}, {7, 5, 2, 2}, 95, 4, 4},
    {"K", "Kicker", {"PWR", "ACC", "---", "---"}, {8, 8, 0, 0}, 40, 1, 1},
};

const char *const first_names[NUM_FIRST_NAMES] = {
    "Ace", "Al", "Alonzo", "Amos", "Andre", "Arlo", "Barry", "Beau",
    "Ben", "Blake", "Bo", "Brock", "Bruno", "Buck", "Cal", "Carl",
    "Cedric", "Chet", "Clay", "Cole", "Curtis", "Dale", "Dante", "Darnell",
    "Dean", "Deon", "Derek", "Dex", "Duke", "Dwayne", "Eddie", "Eli",
    "Emmett", "Ezra", "Felix", "Floyd", "Gabe", "Gus", "Hank", "Hector",
    "Hugo", "Ike", "Isaiah", "Jack", "Jalen", "Jamal", "Jesse", "Joel",
    "Jonah", "Kurt", "Lance", "Leon", "Lionel", "Luis", "Malik", "Marco",
    "Marcus", "Milo", "Moses", "Nate", "Nico", "Otis", "Owen", "Percy",
    "Quinn", "Ralph", "Reggie", "Rex", "Rico", "Rocco", "Rudy", "Russ",
    "Sam", "Sonny", "Stan", "Terrell", "Theo", "Tito", "Toby", "Tony",
    "Trent", "Troy", "Ty", "Vance", "Vic", "Wade", "Walt", "Wes",
    "Willis", "Xavier", "Zach", "Zeke", "Jude", "Kofi", "Rafael", "Omar",
};

const char *const last_names[NUM_LAST_NAMES] = {
    "Abbott", "Acosta", "Adler", "Archer", "Avery", "Banks", "Barlow", "Baxter",
    "Beckett", "Bishop", "Blaine", "Booker", "Bowman", "Brady", "Briggs", "Bristow",
    "Brooks", "Burke", "Byers", "Calloway", "Carver", "Castillo", "Chandler", "Cobb",
    "Colby", "Conley", "Crane", "Crowder", "Cruz", "Dalton", "Dawes", "Decker",
    "Delgado", "Dillard", "Donovan", "Doyle", "Drake", "Dunbar", "Easton", "Ellison",
    "Emery", "Fairley", "Farrow", "Fenwick", "Finch", "Fleming", "Flores", "Fowler",
    "Gaines", "Garland", "Garrison", "Gentry", "Gibbs", "Goodwin", "Graves", "Griffin",
    "Hadley", "Hale", "Harlan", "Hayes", "Holloway", "Hooper", "Horton", "Hudson",
    "Ingram", "Irving", "Jaffe", "Jarvis", "Keane", "Kendall", "Kessler", "Kimbrough",
    "Lacey", "Landry", "Larkin", "Lockett", "Lowell", "Lyons", "Maddox", "Mallory",
    "Marsh", "Mathis", "Mercer", "Merritt", "Monroe", "Morales", "Nash", "Nolan",
    "Norwood", "Oakes", "Ogden", "Okafor", "Oliver", "Osborne", "Pace", "Parrish",
    "Payton", "Pierce", "Pruitt", "Quarles", "Ramsey", "Reyes", "Rhodes", "Rios",
    "Royce", "Rutledge", "Sampson", "Sawyer", "Shelton", "Sims", "Slater", "Spencer",
    "Stokes", "Strong", "Sutton", "Talbot", "Tatum", "Thorne", "Tillman", "Torres",
    "Tucker", "Upton", "Vance", "Varga", "Vaughn", "Wakefield", "Walden", "Ward",
    "Watts", "Weller", "Whitfield", "Wilder", "Winslow", "Wolfe", "Yates", "York",
    "Zamora", "Zeller", "Ashby", "Bellamy", "Cortez", "Duvall", "Escobar", "Fontaine",
    "Grimes", "Harmon", "Ibarra", "Jennings", "Kearns", "Lindqvist", "Moreau", "Nakamura",
    "Ortega", "Pickett", "Quintero", "Rourke", "Stroud", "Thibault", "Underwood", "Voss",
};
