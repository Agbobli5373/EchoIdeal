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
import { defineSettings } from "@/lib/settings-index";

// Registered for settings search (see lib/settings-index).
const SETTINGS = defineSettings("/general", {
  "delete-chats": {
    title: "Delete chat history",
    keywords: "clear remove chats conversations history",
  },
});

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
        {...SETTINGS["delete-chats"]}
        desc={
          result === "deleted"
            ? "Every Chat was deleted. Meetings and Knowledge are still here."
            : result === "failed"
              ? "Couldn’t delete your Chats. Try again."
              : "Removes every Chat. Meetings and Knowledge stay."
        }

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
