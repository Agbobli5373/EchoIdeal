import curl2Json from "@bany/curl-to-json";
import { EditIcon, TrashIcon } from "lucide-react";
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
import { TYPE_PROVIDER } from "@/types";

type CustomProviderHook = {
  handleEdit: (id: string) => void;
  handleDelete: (id: string) => void;
  deleteConfirm: string | null;
  confirmDelete: () => void;
  cancelDelete: () => void;
  showForm: boolean;
  setShowForm: (show: boolean) => void;
  setErrors: (errors: Record<string, string>) => void;
};

/**
 * The rows inside a "Custom providers" disclosure: each provider made from a
 * curl command, and a row that opens the form (`form`) to add another.
 */
export const CustomProviderRows = ({
  idPrefix,
  providers,
  hook,
  form,
}: {
  idPrefix: string;
  providers: TYPE_PROVIDER[];
  hook: CustomProviderHook;
  form: React.ReactNode;
}) => {
  const custom = providers.filter((provider) => provider?.isCustom);

  return (
    <>
      {custom.map((provider) => {
        const json = curl2Json(provider?.curl);
        return (
          <SettingsRow
            key={provider.id}
            id={`${idPrefix}-custom-${provider.id}`}
            title={json?.url || "Invalid curl command"}
            desc={`Response path: ${
              provider?.responseContentPath || "not set"
            } · Streaming: ${provider?.streaming ? "on" : "off"}`}
            control={
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => provider?.id && hook.handleEdit(provider.id)}
                  title="Edit provider"
                  aria-label="Edit provider"
                >
                  <EditIcon className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => provider?.id && hook.handleDelete(provider.id)}
                  title="Delete provider"
                  aria-label="Delete provider"
                >
                  <TrashIcon className="size-3.5" />
                </Button>
              </>
            }
          />
        );
      })}

      <SettingsRow
        id={`${idPrefix}-curl`}
        title="Add a custom provider"
        desc="Paste a curl command; the text, image and system prompt are filled in for you."
        keywords="curl custom endpoint api provider"
        stacked={hook.showForm}
        control={
          hook.showForm ? undefined : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                hook.setShowForm(true);
                hook.setErrors({});
              }}
            >
              Add
            </Button>
          )
        }
      >
        {hook.showForm && form}
      </SettingsRow>

      <Dialog
        open={!!hook.deleteConfirm}
        onOpenChange={(open) => !open && hook.cancelDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this custom provider?</DialogTitle>
            <DialogDescription>This can’t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={hook.cancelDelete}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={hook.confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
