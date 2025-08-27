import { z } from "zod";

export const scheduleChatSchema = z.object({
  reply: z
    .string()
    .describe(
      "Odpowiedź asystenta w naturalnym języku po polsku. Może zadawać pytania uściślające, wyjaśniać decyzje lub proponować harmonogram.",
    ),
  schedule: z
    .object({
      rationale: z
        .string()
        .describe(
          "Krótkie uzasadnienie (<= 3 zdania) dlaczego wybrano te grupy lub czego brakuje.",
        ),
      groupIds: z
        .array(
          z
            .string()
            .describe("Id grupy wybrane dokładnie z listy dostępnych groupId."),
        )
        .min(1)
        .describe(
          "Lista wybranych groupId tworzących spójny plan bez konfliktów czasowych (jeśli możliwe).",
        ),
    })
    .optional()
    .describe(
      "Proponowany plan. Nie zwracaj dopóki nie masz wystarczających informacji od użytkownika – najpierw pytaj o preferencje jeśli są niejasne.",
    ),
  suggestions: z
    .array(
      z
        .string()
        .describe(
          "Sugestia - podpowiedź, którą użytkownik może wybrać jako odpowiedź, nie ma możliwości jej edytowania więc powinna być kompletna i jasna.",
        ),
    )
    .max(4)
    .optional()
    .describe(
      "Do 4 sugestii - podpowiedzi, które użytkownik może wybrać jako odpowiedź, aby poprowadzić rozmowę dalej lub odpowiedzieć na pytania asystenta.",
    ),
});

export type ScheduleChatObject = z.infer<typeof scheduleChatSchema>;
