/* Pixel Pigskin - an arcade American football career game for the
 * Game Boy Advance. Original homebrew. */
#include "gba.h"
#include "gfx.h"
#include "input.h"
#include "sound.h"
#include "screens.h"
#include "rng.h"

int main(void)
{
    gfx_init();
    snd_init();
    rng_seed(0xC0FFEE11u);
    input_poll();
    for (;;)
        screen_title();
    return 0;
}
