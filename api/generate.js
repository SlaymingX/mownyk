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

  const prompt = `Згенеруй мені 2 тексту, де будуть зустрічатися кожне слово або вираз із переліку нижче. Тільки пиши суцільними текстами без нумерувань. Просто познач Текст 1, Текст 2. Також не пиши якихось вступних мов, фраз: наприкінці теж: суто тексти. Якщо в переліку слів зустрічаються фрази з дужками - виключай їх. Наприклад (якщо беремо російську та українську): "Ну, пока (прощание) вам з вашим ремонтом!" (вихідне слово: пока (прощание)) — пиши як "Ну, пока вам з вашим ремонтом!". Можеш змінювати відмінки та час словам: головне, щоб вони співпадали в обох текстах.

Про перелік: він представляє пари слів з двох мов, які є перекладами одне одному. Вони згруповані по два (1. Мова1, 2. Мова2). Це чергування постійно простежується.

1 текст. Текст Мови2 на будь-яку тему, але там повинні зустрічатися усі слова, що я скину нижче. А точніше — їхні відповідники з Мови1. Перелік нижче представляє слова парами (спочатку Мова1, потім Мова2) Ось приклад: "Мы решили загаси́ти пожар" (текст написано мовою2 — у переліку ця мова на другому місці в парі. А ось виділене слово — з мови1). Тобто замість слова "потушить" береться його пара "загаси́ти". Також ці слова треба в тексі виділити жирним шрифтом - щоб їх знайти швидко.

2 текст. Це абсолютно той же текст речення за реченням — тільки навпаки. Основа тексту відтепер з Мови1 (у межах розумного майже дословно перекладена). А ось слова з переліку — відтепер з мови2 (пари для мови1). І знову треба виділити слово жирним.

Далі я сюди теж буду писати вже нові переліки слів — ніяк їх не поєднуй з іншими запитами: тобто - кожен новий запит — абсолютно самостійні нові 2 тексти на нові слова й мабуть мови.

Важливо: у кожному новому запиті забувай про попередню Мову1 та Мову2 — визнач нові з нових слів.

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
