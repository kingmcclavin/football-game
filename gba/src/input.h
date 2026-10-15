#ifndef INPUT_H
#define INPUT_H
#include "types.h"

extern u16 key_held, key_pressed, key_released, key_repeat;
/* Poll once per frame. */
void input_poll(void);
/* Optional scripted input (used by the automated test build). */
#define KEY_ANY_DIR 0x00F0
#endif
