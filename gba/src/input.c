#include "input.h"
#include "gba.h"

u16 key_held, key_pressed, key_released, key_repeat;
static u16 s_prev;
static u8 s_repeatTimer[10];

void input_poll(void)
{
    u16 k = (u16)(~REG_KEYINPUT & KEY_MASK);
    key_held = k;
    key_pressed = (u16)(k & ~s_prev);
    key_released = (u16)(~k & s_prev);
    key_repeat = key_pressed;
    for (int i = 0; i < 10; i++) {
        u16 bit = (u16)(1 << i);
        if (k & bit) {
            if (key_pressed & bit) {
                s_repeatTimer[i] = 18;
            } else if (--s_repeatTimer[i] == 0) {
                s_repeatTimer[i] = 5;
                key_repeat |= bit;
            }
        }
    }
    s_prev = k;
}
