// Degraded mode (Практика 5): після N поспіль збоїв показуємо банер «перевантажено»
// і тимчасово вимикаємо кнопки. Після паузи перевіряємо /health і, якщо сервер живий, виходимо.

(function (global) {
  'use strict';

  function createDegradedMode({ threshold = 3, cooldownMs = 10000, probe, onChange }) {
    let failures = 0;
    let degraded = false;
    let timer = null;
    let untilTs = 0;

    const emit = () => onChange({ degraded, failures, threshold, untilTs });

    async function tryRecover() {
      timer = null;
      const ok = await probe().catch(() => false);
      if (ok) {
        failures = 0;
        degraded = false;
        emit();
      } else {
        schedule(); // сервер ще лежить — чекаємо ще раз
      }
    }

    function schedule() {
      untilTs = Date.now() + cooldownMs;
      timer = setTimeout(tryRecover, cooldownMs);
      emit();
    }

    return {
      // Успішна відповідь (2xx/4xx — сервер живий) обнуляє лічильник
      success() {
        if (failures === 0 && !degraded) return;
        failures = 0;
        if (!degraded) emit();
      },
      // Збій: 5xx, 429 після всіх повторів, таймаут, мережа
      failure() {
        failures += 1;
        if (!degraded && failures >= threshold) {
          degraded = true;
          schedule();
        } else {
          emit();
        }
      },
      isDegraded: () => degraded,
      // Для кнопки «Спробувати зараз»
      retryNow() {
        if (timer) clearTimeout(timer);
        return tryRecover();
      },
    };
  }

  global.StudyDegraded = { createDegradedMode };
}(typeof window !== 'undefined' ? window : globalThis));
