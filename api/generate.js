export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { words } = req.body;
  if (!words || typeof words !== 'string' || !words.trim()) {
    return res.status(400).json({ error: 'Поле "words" обов\'язкове' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY не задано на сервері' });
  }

  const prompt = `Згенеруй два зв'язні тексти на довільну тему. Тексти мають бути ідентичними за змістом (перекладені речення за реченням), і в них мають бути використані всі слова з наданого нижче переліку. Перелік містить пари слів: [Слово з Мови 1] — [Слово з Мови 2].

Правила генерації:

1. Формат виводу: Жодних вступних чи завершальних фраз. Тільки заголовки «Текст 1» та «Текст 2», а під ними — суцільні тексти без нумерації.
2. Автономність: Самостійно визнач Мову 1 та Мову 2 на основі наданого переліку. Кожен новий мій запит — це абсолютно нові мови та нові слова. Забувай попередні контексти.
3. Видалення дужок: Якщо в переліку біля слова є уточнення в дужках (наприклад, "пока (прощание)"), повністю ігноруй і видаляй дужки та текст у них. Використовуй лише саме слово ("пока").
4. Граматична узгодженість (ВАЖЛИВО): Ти маєш змінювати відмінки, час, число та рід вставлених слів, щоб вони ідеально і безшовно вписувалися в синтаксис базового тексту. Вставлене слово з іншої мови має узгоджуватися з прийменниками та сусідніми словами базової мови. Наприклад: якщо база тексту російська "лесник шел по", а вставити треба слово "сте́жка", обов'язково змінюй відмінок вставленого слова: "лесник шел по сте́жці".
5. Збереження наголосів: Якщо в наданому переліку слова мають знак наголосу (наприклад, ми́то, сте́жка), обов'язково зберігай цей знак у тексті, навіть коли змінюєш форму слова (наприклад, ми́том, сте́жці).
6. Форматування: Обов'язково виділяй вставлені слова з переліку жирним шрифтом, використовуючи Markdown (ось так: **сло́во**).

Логіка текстів:

* Текст 1: Основна мова тексту — Мова 1. Однак замість слів з переліку ти маєш використати їхні відповідники з Мови 2, граматично адаптувати їх до речення і виділити жирним.
* Текст 2: Основна мова тексту — Мова 2. Однак замість слів з переліку ти маєш використати їхні відповідники з Мови 1, граматично адаптувати їх до речення і виділити жирним.

Перелік слів:
  ${words.trim()}`;


  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            }
          ],
          generationConfig: {
            maxOutputTokens: 8192,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);

      // Try to parse Google's error body for a more specific status code
      let googleStatus = '';
      try {
        const parsed = JSON.parse(errText);
        googleStatus = parsed?.error?.status || '';
      } catch (e) {}

      if (geminiRes.status === 503 || googleStatus === 'UNAVAILABLE') {
        return res.status(503).json({
          error: 'Модель перевантажено. Зачекайте кілька секунд і спробуйте ще раз.',
          code: 'overloaded',
        });
      }
      if (geminiRes.status === 429 || googleStatus === 'RESOURCE_EXHAUSTED') {
        return res.status(429).json({
          error: 'Забагато запитів підряд. Зачекайте трохи і спробуйте знову.',
          code: 'rate_limited',
        });
      }
      if (geminiRes.status >= 500) {
        return res.status(502).json({
          error: 'Тимчасова помилка на боці Gemini. Спробуйте ще раз за кілька секунд.',
          code: 'server_error',
        });
      }

      return res.status(502).json({ error: 'Помилка від Gemini API', details: errText, code: 'api_error' });
    }

    const data = await geminiRes.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Gemini повернув порожню відповідь' });
    }

    return res.status(200).json({ result: text });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({
      error: 'Не вдалося з\'єднатися з Gemini. Перевірте інтернет і спробуйте ще раз.',
      details: err.message,
      code: 'network_error',
    });
  }
}
