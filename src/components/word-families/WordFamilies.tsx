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
    void reload();
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
            className="data-[state=inactive]:hidden"
          >
            <FamilyPractice
              {...data}
              selectedPracticeRequest={selectedPracticeRequest}
              reload={reload}
              openLibrary={() => setTab("library")}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
