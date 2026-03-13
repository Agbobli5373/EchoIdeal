import { useCompletion } from "@/hooks";
import { Screenshot } from "./Screenshot";
import { Files } from "./Files";
import { Audio } from "./Audio";
import { Input } from "./Input";
import { Button } from "@/components";
import { ScanEyeIcon, SendIcon } from "lucide-react";

export const Completion = ({ isHidden }: { isHidden: boolean }) => {
  const completion = useCompletion();

  return (
    <>
      <Audio {...completion} />
      <Input {...completion} isHidden={isHidden} />
      <Button
        size="icon"
        variant="ghost"
        className="cursor-pointer"
        title="Screenshot & Analyze — capture screen and send to AI instantly"
        onClick={completion.captureAndAnalyze}
        disabled={completion.isLoading || completion.isScreenshotLoading}
      >
        <ScanEyeIcon className="h-4 w-4" />
      </Button>
      <Screenshot {...completion} />
      <Files {...completion} />
      {completion.attachedFiles.length > 0 && !completion.isLoading && (
        <Button
          size="icon"
          className="cursor-pointer"
          title="Send attached files to AI"
          onClick={completion.sendAttachedFiles}
        >
          <SendIcon className="h-4 w-4" />
        </Button>
      )}
    </>
  );
};
