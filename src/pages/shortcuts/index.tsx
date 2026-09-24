import { CursorSelection, ShortcutManager } from "./components";
import { SettingsGroup } from "@/components";
import { PageLayout } from "@/layouts";

const Shortcuts = () => {
  return (
    <PageLayout
      title="Shortcuts and Cursor"
      subtitle="Keys that work even when EchoIdeal isn’t focused."
    >
      <SettingsGroup title="Cursor">
        <CursorSelection />
      </SettingsGroup>
      <ShortcutManager />
    </PageLayout>
  );
};

export default Shortcuts;
