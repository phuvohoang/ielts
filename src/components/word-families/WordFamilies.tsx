import { ContextPractice } from "./ContextPractice";
import { NativeSelect } from "../ui/native-select";
import { PracticePanel } from "../practice/PracticePanel";
import { loadContextRuns } from "../../lib/word-families/context-storage";
import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { Alert, AlertDescription } from "../reui/alert";
import { Button } from "../ui/button";
import { PracticeLoading } from "../practice/PracticePanel";
import { loadWordFamilies } from "../../lib/word-families/storage";
import { WordLibrary } from "./WordLibrary";
import { FamilyPractice } from "./FamilyPractice";
type Data = Awaited<ReturnType<typeof loadWordFamilies>>;
export function WordFamilies() {
  const [exercise, setExercise] = useState("recall");
  const [tab, setTab] = useState("library"),
    [data, setData] = useState<Data>(),
    [error, setError] = useState("");
  const [selectedPracticeRequest, setSelectedPracticeRequest] = useState(0);
  async function reload() {
    try {
      const next = await loadWordFamilies();
      setData(next);
      setError("");
    } catch {
      setError(
        "Chưa đọc được Word Families trên thiết bị. Dữ liệu chưa bị xóa.",
      );
    }
  }
  useEffect(() => {
    void (async () => {
      await reload();
      try {
        const [context, recall] = await Promise.all([
          loadContextRuns(),
          loadWordFamilies(),
        ]);
        const draft = context.find((r) => !r.completed);
        if (
          draft &&
          draft.updatedAt >
            (recall.runs.find((r) => !r.completed)?.updatedAt ?? 0)
        )
          setExercise("context");
      } catch {
        /* Each practice view retains its own retryable load error. */
      }
    })();
  }, []);
  return (
    <div className="flex min-w-0 flex-col gap-6 text-sm">
      <div className="heading">
        <div className="eyebrow">WORD FORMATION · LOCAL PRACTICE</div>
        <h1>Word Families</h1>
        <p>
          Nhập từ của bạn, luyện các dạng từ và xem lại điểm yếu. Chấm trực tiếp
          trên thiết bị.
        </p>
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>
            {error}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reload()}
            >
              Thử lại
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {!data ? (
        <PracticeLoading title="Đang đọc thư viện">
          Khôi phục từ và lịch sử trên thiết bị…
        </PracticeLoading>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList aria-label="Word Families">
            <TabsTrigger value="library">Word Library</TabsTrigger>
            <TabsTrigger value="practice">Practice</TabsTrigger>
          </TabsList>
          <TabsContent
            value="library"
            forceMount
            className="data-[state=inactive]:hidden"
          >
            <WordLibrary
              families={data.families}
              selections={data.selections}
              reload={reload}
              practiceSelected={() => {
                setSelectedPracticeRequest((n) => n + 1);
                setTab("practice");
              }}
            />
          </TabsContent>
          <TabsContent
            value="practice"
            forceMount
            className="flex flex-col gap-6 data-[state=inactive]:hidden"
          >
            <PracticePanel title="Loại bài tập">
              <label className="flex flex-col gap-2">
                Chọn loại bài
                <NativeSelect
                  aria-label="Loại bài tập"
                  value={exercise}
                  onChange={(e) => setExercise(e.target.value)}
                >
                  <option value="recall">Word Family Recall</option>
                  <option value="context">Word Formation in Context</option>
                </NativeSelect>
              </label>
            </PracticePanel>
            <div hidden={exercise !== "recall"}>
              <FamilyPractice
                {...data}
                selectedPracticeRequest={selectedPracticeRequest}
                reload={reload}
                openLibrary={() => setTab("library")}
              />
            </div>
            <div hidden={exercise !== "context"}>
              <ContextPractice
                families={data.families}
                selections={data.selections}
                selectedPracticeRequest={selectedPracticeRequest}
                active={tab === "practice" && exercise === "context"}
                openLibrary={() => setTab("library")}
              />
            </div>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
