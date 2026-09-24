import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  SettingsRow,
} from "@/components";
import { UseSettingsReturn } from "@/types";

export const DeleteChats = ({
  handleDeleteAllChatsConfirm,
  showDeleteConfirmDialog,
  setShowDeleteConfirmDialog,
}: Pick<
  UseSettingsReturn,
  | "handleDeleteAllChatsConfirm"
  | "showDeleteConfirmDialog"
  | "setShowDeleteConfirmDialog"
>) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [result, setResult] = useState<"deleted" | "failed" | null>(null);

  const deleteAllChats = async () => {
    setIsDeleting(true);
    const deleted = await handleDeleteAllChatsConfirm();
    setIsDeleting(false);
    setResult(deleted ? "deleted" : "failed");
  };

  return (
    <>
      <SettingsRow
        id="delete-chats"
        title="Delete chat history"
        desc={
          result === "deleted"
            ? "Every Chat was deleted. Meetings and Knowledge are still here."
            : result === "failed"
              ? "Couldn’t delete your Chats. Try again."
              : "Removes every Chat. Meetings and Knowledge stay."
        }
        keywords="clear remove chats conversations history"
        control={
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setResult(null);
              setShowDeleteConfirmDialog(true);
            }}
          >
            Delete…
          </Button>
        }
      />

      <Dialog
        open={showDeleteConfirmDialog}
        onOpenChange={(open) => !isDeleting && setShowDeleteConfirmDialog(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete every Chat?</DialogTitle>
            <DialogDescription>
              This removes all your Chats and their messages, and it can’t be
              undone. Your Meetings and Knowledge aren’t affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteAllChats}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="size-4 animate-spin" />}
              Delete Chats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
