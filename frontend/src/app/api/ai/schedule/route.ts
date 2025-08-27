import { xai } from "@ai-sdk/xai";
import type { UIMessage } from "ai";
import { convertToModelMessages, streamText, zodSchema } from "ai";

import { scheduleChatSchema } from "@/app/api/ai/schedule/schema";

export const maxDuration = 30;

interface CourseContextCourse {
  id: string;
  name: string;
  groups: {
    groupId: string;
    courseName: string;
    courseType: "C" | "L" | "P" | "S" | "W";
    day: string;
    week: "" | "TN" | "TP";
    startTime: string;
    endTime: string;
    spotsOccupied: number;
    spotsTotal: number;
    averageRating?: number;
    isChecked: boolean;
  }[];
}

interface ScheduleChatRequestBody {
  messages: UIMessage[];
  coursesContext?: CourseContextCourse[];
}

const weekTypeMap: Record<string, string> = {
  "": "co tydzień",
  TN: "w tygodniach nieparzystych",
  TP: "w tygodniach parzystych",
};

export async function POST(request: Request) {
  const raw = (await request.json()) as ScheduleChatRequestBody;
  let messages: UIMessage[] = [];
  let coursesContext: CourseContextCourse[] = [];

  messages = raw.messages;
  coursesContext = raw.coursesContext ?? [];

  const coursesLines: string[] = [];
  for (const c of coursesContext) {
    const groupSummaries = c.groups
      .map(
        (g) =>
          `${g.groupId}|${g.courseName}|${g.courseType}|${g.day}|${weekTypeMap[g.week]}|${g.startTime}-${g.endTime}|${g.spotsOccupied.toString()}/${g.spotsTotal.toString()}`,
      )
      .join(", ");
    coursesLines.push(`${c.name}: ${groupSummaries}`);
  }
  const grounding = coursesLines.join("\n");

  const systemInstructions = `Jesteś asystentem pomagającym studentowi ułożyć plan zajęć (Politechnika Wrocławska). Masz listę dostępnych grup.

Zasady ogólne:
- Odpowiadaj po polsku, zwięźle.
- Nie twórz kursów ani grup spoza listy. Używaj wyłącznie dokładnych 'groupId' z podanych danych.
- Gdy użytkownik prosi o zmiany, modyfikuj tylko to, co konieczne. Zachowuj wcześniejsze wybory, jeśli dalej nie kolidują z preferencjami.
- Domyślnie uwzględnij wszystkie kursy, chyba że użytkownik wyraźnie wskaże, że jakiś kurs ma być pominięty.
- Jeśli użytkownik nie poda konkretnych preferencji, stosuj zasady domyślne i postaraj się ułożyć jak najlepszy plan.

Zasady budowy planu:
1) Wybieraj DOKŁADNIE JEDNĄ grupę (groupId) danego typu zajęć dla każdego kursu (courseType: C, L, P, S, W).
2) Unikaj konfliktów czasowych:
   - Przedziały czasu są w formacie HH:MM 24h. Dwa przedziały kolidują, jeśli startA < endB oraz startB < endA. Styk końca z początkiem (endA == startB) nie jest konfliktem.
   - Konflikt dotyczy tylko tych samych dni (day) oraz tygodni, które się pokrywają.
   - Pokrywanie tygodni: "co tydzień" koliduje ze wszystkim; "w tygodniach nieparzystych" koliduje z "w tygodniach nieparzystych" i "co tydzień" ale nie z "w tygodniach parzystych"; "w tygodniach parzystych" koliduje z "w tygodniach parzystych" i "co tydzień" ale nie z "w tygodniach nieparzystych".
3) Preferencje domyślne (gdy brak innych wytycznych):
   - Wyższa 'averageRating' jest lepsza.
   - W razie remisu preferuj grupy z większą dostępnością miejsc (niższy stosunek occupied/total), unikaj pełnych jeśli to możliwe.
   - Następnie preferuj wcześniejsze godziny tego samego dnia.
   - Następnie stabilne, deterministyczne sortowanie po 'groupId'.
4) Jeśli użytkownik wskaże konkretne 'groupId', użyj go, o ile nie tworzy konfliktu i istnieje na liście.
5) Jeśli nie da się ułożyć planu bez konfliktów zgodnie z preferencjami, nie zwracaj 'schedule'. Zamiast tego zwięźle wyjaśnij, co blokuje plan, oraz zaproponuj alternatywy lub poproś o doprecyzowanie (maksymalnie 2 pytania).

Wytyczne wyjścia:
- Odpowiadaj wyłącznie w formacie JSON, nie używaj innych formatów. W JSON NIGDY NIE DODAWAJ komentarzy ani dodatkowych pól.
- Zwracaj wynik jako obiekt zgodny ze schematem. Nie dodawaj treści spoza obiektu. Gdy proponujesz plan, dołącz 'schedule' z 'groupId' wyłącznie z listy dostępnych. Gdy potrzebujesz doprecyzowania, zwróć tylko wiadomość i sugestie ale bez 'schedule'.
- Zawsze zwracaj wszystkie wybrane 'groupId' w 'schedule' - nawet jeśli były w poprzednich wiadomościach.
- Sugestie to kompletne, jasne odpowiedzi, które użytkownik może wybrać - np. "Wybierz grupę X dla kursu Y", "Usuń kurs Z", "Szukam grup popołudniowych", "Pomiń wykłady".

Schemat odpowiedzi:
${JSON.stringify(zodSchema(scheduleChatSchema), null, 2)}

Definicje pól:
- courseType: C (ćwiczenia), L (laboratorium), P (projekt), S (seminarium), W (wykład).
- day: PONIEDZIAŁEK, WTOREK, ŚRODA, CZWARTEK, PIĄTEK, SOBOTA, NIEDZIELA.
- week: co tydzień (""), w tygodniach nieparzystych ("TN"), w tygodniach parzystych ("TP").

Dostępne kursy i grupy (groupId|courseName|type|day|week|start-end|occupied/total):\n${grounding}`;

  const result = streamText({
    model: xai("grok-3-mini"),
    system: systemInstructions,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
