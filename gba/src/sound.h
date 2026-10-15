/* PSG sound: effects on channels 2 (square) and 4 (noise), music on
 * channels 1 (square melody) and 3 (wave bass). */
#ifndef SOUND_H
#define SOUND_H

#include "types.h"

enum {
    SFX_MOVE, SFX_OK, SFX_BACK, SFX_ERROR, SFX_SNAP, SFX_THROW, SFX_CATCH,
    SFX_TACKLE, SFX_WHISTLE, SFX_FIRSTDOWN, SFX_TOUCHDOWN, SFX_KICK, SFX_GOOD,
    SFX_MISS, SFX_TURNOVER, SFX_CROWD, SFX_JUKE, SFX_COIN, NUM_SFX
};

enum { MUS_NONE, MUS_TITLE, MUS_HUB, MUS_VICTORY, MUS_DEFEAT, MUS_CHAMPION, NUM_MUS };

void snd_init(void);
void snd_update(void);       /* once per frame */
void snd_play(int sfx);
void music_play(int song);
void music_stop(void);
int music_current(void);
void snd_set_enabled(int on);
int snd_enabled(void);

#endif
