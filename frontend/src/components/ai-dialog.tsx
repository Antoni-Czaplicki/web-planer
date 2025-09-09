"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { FolderInput, Sparkles } from "lucide-react";
import { parse as partialParse } from "partial-json";
import React, { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { scheduleChatSchema } from "@/app/api/ai/schedule/schema";
import type { ExtendedCourse, ExtendedGroup } from "@/atoms/plan-family";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Response } from "@/components/ai-elements/response";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { usePlan } from "@/lib/use-plan";

import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";

// Reduce courses to lightweight context for the API (avoid sending all props like opinionsCount etc.)
// Strip JS-style comments from JSON-ish AI responses before attempting to parse.
function stripJsonComments(input: string): string {
  // Fast path: no obvious comment tokens
  if (!/\/[/*]/.test(input)) {
    return input;
  }
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < input.length; index++) {
    const ch = input[index];
    const next = input[index + 1];
    if (inString) {
      out += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    // Line comment //...
    if (ch === "/" && next === "/") {
      // Skip until newline (preserve newline)
      while (index < input.length && input[index] !== "\n") {
        index++;
      }
      out += "\n"; // maintain line structure for better error positions
      continue;
    }
    // Block comment /* ... */
    if (ch === "/" && next === "*") {
      index += 2; // skip /*
      while (
        index < input.length &&
        !(input[index] === "*" && input[index + 1] === "/")
      ) {
        index++;
      }
      index++; // skip closing /
      continue;
    }
    out += ch;
  }
  return out;
}

const buildCoursesContext = (courses: ExtendedCourse[]) =>
  courses.map((c) => ({
    id: c.id,
    name: c.name,
    groups: c.groups.map((g) => ({
      groupId: g.groupId,
      courseName: g.courseName,
      courseType: g.courseType,
      day: g.day,
      week: g.week,
      startTime: g.startTime,
      endTime: g.endTime,
      spotsOccupied: g.spotsOccupied,
      spotsTotal: g.spotsTotal,
      averageRating: g.averageRating,
      isChecked: g.isChecked,
      lecturer: g.lecturer,
    })),
  }));

export function AIDialog({
  availableCourses,
  planId,
}: {
  availableCourses: ExtendedCourse[];
  planId: string;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingInput, setPendingInput] = useState("");
  const plan = usePlan({ planId });

  const coursesContext = useMemo(
    () => buildCoursesContext(availableCourses),
    [availableCourses],
  );

  const parseStructured = useCallback((text: string) => {
    if (text.includes("{")) {
      try {
        const candidate = partialParse(stripJsonComments(text)) as unknown;
        const parsed = scheduleChatSchema.safeParse(candidate);
        if (parsed.success) {
          return {
            reply: parsed.data.reply,
            schedule: parsed.data.schedule ?? null,
            suggestions: parsed.data.suggestions ?? [],
          };
        } else if (
          typeof candidate === "object" &&
          candidate != null &&
          "reply" in candidate
        ) {
          return {
            reply: String(candidate.reply),
            schedule: null,
            suggestions: [],
          };
        }
      } catch (error_) {
        console.warn("Failed to parse JSON from AI response");
        console.error(error_);
      }
    }
    return { reply: text, schedule: null, suggestions: [] };
  }, []);

  const [suggestions, setSuggestions] = useState<string[]>([
    "Unikaj zajęć przed 10:00",
    "Chciałbym wolne piątki",
    "Preferuj wysokie oceny prowadzących",
    "Zamień laboratorium na późniejszą grupę",
  ]);

  const { messages, sendMessage, status, stop, error } = useChat({
    id: `schedule-${planId}`,
    transport: new DefaultChatTransport({
      api: "/api/ai/schedule",
      // Include lightweight courses context each request
      prepareSendMessagesRequest: ({ messages: uiMessages }) => ({
        body: {
          messages: uiMessages,
          coursesContext,
        },
      }),
    }),
    messages: [
      {
        id: "first",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Cześć! Jak mogę pomóc?",
          },
        ],
      },
      // {
      //   id: "user",
      //   role: "assistant",
      //   parts: [
      //     {
      //       type: "text",
      //       // text: '{ "reply": "Na podstawie Twojego życzenia, ułożyłem plan obejmujący tylko wykłady. Wybrałem wszystkie dostępne grupy typu \'W\' bez konfliktów czasowych.", "schedule": { "rationale": "Użytkownik poprosił o tylko wykłady, więc uwzględniłem wyłącznie grupy typu \'W\'. Wszystkie wybrane wykłady nie nakładają się, biorąc pod uwagę dni i tygod',
      //
      //       text: '{ "reply": "Na podstawie Twojego życzenia, ułożyłem plan obejmujący tylko wykłady. Wybrałem wszystkie dostępne grupy typu \'W\' bez konfliktów czasowych.", "schedule": { "rationale": "Użytkownik poprosił o tylko wykłady, więc uwzględniłem wyłącznie grupy typu \'W\'. Wszystkie wybrane wykłady nie nakładają się, biorąc pod uwagę dni i tygodnie.", "groupIds": [ "1W04ITE-SI0012GW04-ITE-SI-5-25ZW", "1W04ITE-SI0011GW04-ITE-SI-5-25ZW", "1W04ITE-SI0067GW04-ITE-SI-5-25ZW", "1W04ITE-SI0048GW04-ITE-SI-5-25ZW", "1W04ITE-SI0065GW04-ITE-SI-5-25ZW", "1W04ITE-SI0015GW04-ITE-SI-5-25ZW" ] } }',
      //     },
      //   ],
      // },
    ] as UIMessage[],
    onFinish: (message) => {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      const structuredFound = structuredMessages.find(
        (m) => m.id === message.message.id,
      );
      if (structuredFound != null && structuredFound.suggestions.length > 0) {
        setSuggestions(structuredFound.suggestions);
        return;
      }
      const parsed = parseStructured(
        message.message.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(""),
      );
      if (parsed.suggestions.length > 0) {
        setSuggestions(parsed.suggestions);
      } else {
        setSuggestions([]);
      }
    },
    onError: () => {
      toast.error("Wystąpił błąd podczas komunikacji z AI.");
    },
  });

  const getSelectedGroupsByIds = useCallback(
    (groupIds: string[] | null): ExtendedGroup[] => {
      if (groupIds == null) {
        return [];
      }
      const selected: ExtendedGroup[] = [];
      for (const id of groupIds) {
        for (const c of availableCourses) {
          for (const g of c.groups) {
            if (g.groupId === id) {
              selected.push(g);
            }
          }
        }
      }
      return selected;
    },
    [availableCourses],
  );

  const structuredMessages = useMemo(
    () =>
      messages.map((m) => {
        const fullText = m.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");
        if (m.role === "assistant") {
          const parsed = parseStructured(fullText);
          return {
            id: m.id,
            reply: parsed.reply,
            schedule: {
              rationale: parsed.schedule?.rationale ?? null,
              groups: getSelectedGroupsByIds(parsed.schedule?.groupIds ?? null),
            },
            suggestions: parsed.suggestions,
          };
        }
        return {
          id: m.id,
          reply: fullText,
          schedule: null,
          suggestions: [] as string[],
        };
      }),
    [getSelectedGroupsByIds, messages, parseStructured],
  );

  const chatIsLoading = status === "submitted" || status === "streaming";

  const handleSend = useCallback(async () => {
    const trimmed = pendingInput.trim();
    if (!trimmed || chatIsLoading) {
      return;
    }
    setPendingInput("");
    await sendMessage({ text: trimmed });
  }, [pendingInput, chatIsLoading, sendMessage]);

  const handleAddToUserPlan = (groups?: ExtendedGroup[]) => {
    if (groups != null && groups.length > 0) {
      // najpierw odznacz wszystkie grupy
      const updatedPlan = {
        ...plan,
        courses: plan.courses.map((course) => ({
          ...course,
          groups: course.groups.map((group) => ({
            ...group,
            isChecked: false,
          })),
        })),
        synced: false,
      };

      // następnie zaznacz grupy z wygenerowanego planu
      const finalPlan = {
        ...updatedPlan,
        courses: updatedPlan.courses.map((course) => ({
          ...course,
          groups: course.groups.map((group) => {
            const isInSchedule = groups.some(
              (scheduleGroup) => scheduleGroup.groupId === group.groupId,
            );
            return isInSchedule ? { ...group, isChecked: true } : group;
          }),
        })),
      };
      plan.setPlan(finalPlan);

      setDialogOpen(false);
      toast.success("Plan został ustawiony poprawnie.");
    }
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant={"default"}>
          AI <Sparkles />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-x-auto focus:outline-none">
        <DialogHeader>
          <DialogTitle>Ułóż plan z AI</DialogTitle>
          <DialogDescription>
            Opisz jak miałby wyglądać Twój idealny plan zajęć, a my postaramy
            się go dla Ciebie ułożyć.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-w-0 max-w-full flex-col space-y-6 pt-2">
          <div className="flex flex-col gap-3">
            <div className="rounded-md border">
              <Conversation className="relative size-full h-96 max-h-96 min-h-96 w-full">
                <ConversationContent className="">
                  {messages.map((message) => {
                    const structuredMessage = structuredMessages.find(
                      (s) => s.id === message.id,
                    );

                    return (
                      <Message key={message.id} from={message.role}>
                        <div className="flex flex-col gap-2">
                          <MessageContent>
                            {message.parts
                              .filter((p) => p.type === "reasoning")
                              .map((r, index) => (
                                <Reasoning
                                  className="mb-2"
                                  isStreaming={
                                    (status === "streaming" ||
                                      status === "submitted") &&
                                    message.id === messages.at(-1)?.id
                                  }
                                  key={`${message.id}-reasoning-${index.toString()}`}
                                >
                                  <ReasoningTrigger title="Rozumowanie" />
                                  <ReasoningContent className="italic text-muted-foreground">
                                    {r.text}
                                  </ReasoningContent>
                                </Reasoning>
                              ))}
                            {structuredMessage == null ? (
                              message.parts.some((p) => p.type === "text") ? (
                                message.parts
                                  .filter((p) => p.type === "text")
                                  .map((p, index) => (
                                    <Response
                                      key={`${message.id}-${index.toString()}`}
                                    >
                                      {p.text}
                                    </Response>
                                  ))
                              ) : null
                            ) : (
                              <Response>{structuredMessage.reply}</Response>
                            )}
                          </MessageContent>

                          {structuredMessage?.schedule?.groups != null &&
                            structuredMessage.schedule.groups.length > 0 && (
                              <div className="space-y-2 rounded-lg bg-muted/50 p-3">
                                <div className="flex items-center gap-2">
                                  <h3 className="text-sm font-medium">
                                    Proponowany plan
                                  </h3>
                                  <Badge variant="outline">
                                    {structuredMessage.schedule.groups.length}{" "}
                                    grup
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {structuredMessage.schedule.rationale}
                                </p>
                                <div className="space-y-1 text-xs">
                                  {structuredMessage.schedule.groups.map(
                                    (group) => (
                                      <div
                                        key={group.groupId}
                                        className="rounded bg-background/60 p-1"
                                      >
                                        <span className="font-medium">
                                          {group.courseName}
                                        </span>{" "}
                                        ({group.courseType}) – {group.day}{" "}
                                        {group.week} {group.startTime}-
                                        {group.endTime}
                                      </div>
                                    ),
                                  )}
                                </div>
                                <div className="flex justify-end pt-1">
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      handleAddToUserPlan(
                                        structuredMessage.schedule?.groups,
                                      );
                                    }}
                                  >
                                    <FolderInput className="h-4 w-4" /> Zastosuj
                                  </Button>
                                </div>
                              </div>
                            )}
                        </div>
                        <MessageAvatar
                          className="bg-neutral-100"
                          src={
                            message.role === "user"
                              ? "/assets/avatar_placeholder.png"
                              : "/assets/logo/logo_solvro_color.png"
                          }
                        />
                      </Message>
                    );
                  })}
                  {status === "submitted" && (
                    <Message from="assistant">
                      <MessageContent>
                        <Response>Myślę nad planem...</Response>
                      </MessageContent>
                      <MessageAvatar
                        className="bg-neutral-100"
                        src="/assets/logo/logo_solvro_color.png"
                      />
                    </Message>
                  )}
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            </div>
            <Suggestions>
              {suggestions.map((s) => (
                <Suggestion
                  key={s}
                  suggestion={s}
                  onClick={async (value) => {
                    await sendMessage({ text: value });
                  }}
                  disabled={chatIsLoading}
                  className="whitespace-nowrap"
                />
              ))}
            </Suggestions>
          </div>

          <form
            onSubmit={async (event_: React.FormEvent) => {
              event_.preventDefault();
              await handleSend();
            }}
            className="relative"
          >
            <PromptInputTextarea
              value={pendingInput}
              onChange={(event_) => {
                setPendingInput(event_.target.value);
              }}
              placeholder="Opisz swój idealny plan lub preferencje..."
              disabled={chatIsLoading}
              className="pr-14"
            />
            <div className="absolute bottom-1 right-1 flex gap-2">
              {status === "streaming" || status === "submitted" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => stop()}
                  className="shrink-0"
                >
                  Stop
                </Button>
              ) : null}
              <PromptInputSubmit
                status={status === "streaming" ? "streaming" : "ready"}
                disabled={!pendingInput.trim() || chatIsLoading}
                className="shrink-0"
              />
            </div>
          </form>

          {error != null && (
            <p className="text-xs text-red-600">
              Wystąpił błąd. Spróbuj ponownie.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
