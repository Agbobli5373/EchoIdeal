import {
  Badge,
  Card,
  Empty,
  Button,
  Markdown,
  Textarea,
  GetLicense,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Label,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components";
import { Switch } from "@/components/ui/switch";
import {
  getConversationById,
  updateConversationKnowledgeMode,
  updateConversationStrictKb,
  openKnowledgeSource,
} from "@/lib";
import type { ChatConversation, ConversationKnowledgeMode } from "@/types";
import {
  Download,
  MessageCircleIcon,
  MessageCircleReplyIcon,
  Trash2,
  UserIcon,
  SendIcon,
  Check,
  Loader2,
  ZapIcon,
  MoreHorizontal,
} from "lucide-react";
import { useState, useEffect } from "react";
import moment from "moment";
import { useParams, useNavigate } from "react-router-dom";
import { PageLayout } from "@/layouts";
import { useHistory, useChatCompletion } from "@/hooks";
import { useApp } from "@/contexts";
import {
  DeleteConfirmationDialog,
  ChatAudio,
  ChatScreenshot,
  ChatFiles,
  AudioRecorder,
} from ".";

const View = () => {
  const { conversationId } = useParams();
  const { hasActiveLicense, supportsImages } = useApp();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatConversation | null>(null);

  const {
    handleDeleteConfirm,
    confirmDelete,
    cancelDelete,
    deleteConfirm,
    handleAttachToOverlay,
    handleDownload,
    isDownloaded,
    isAttached,
  } = useHistory();

  const completion = useChatCompletion(
    conversationId as string,
    messages,
    setMessages
  );

  useEffect(() => {
    const getMessages = async () => {
      const conversation = await getConversationById(conversationId as string);
      setMessages(conversation || null);
    };
    getMessages();
  }, [conversationId]);

  useEffect(() => {
    // Scroll to bottom when messages load
    if (messages?.messages.length) {
      setTimeout(() => {
        completion.messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
    }
  }, [messages?.messages.length]);

  const handleDelete = async () => {
    await confirmDelete();
    navigate(-1);
  };

  return (
    <PageLayout
      isMainTitle={false}
      allowBackButton={true}
      title={messages?.title || ""}
      description={`${messages?.messages.length} messages in this conversation`}
      rightSlot={
        <div className="flex max-w-full flex-col items-stretch gap-2 sm:max-w-[min(100%,42rem)] sm:items-end">
          {messages && (
            <div className="flex w-full flex-wrap items-center justify-end gap-2">
              <Select
                value={messages.knowledgeMode ?? "inherit"}
                onValueChange={async (v) => {
                  const mode = v as ConversationKnowledgeMode;
                  if (!conversationId) return;
                  await updateConversationKnowledgeMode(conversationId, mode);
                  setMessages((prev) =>
                    prev ? { ...prev, knowledgeMode: mode } : null
                  );
                }}
              >
                <SelectTrigger
                  className="h-8 w-full min-w-[10rem] max-w-[200px] text-xs sm:w-[200px]"
                  title="Retrieval context for this chat"
                >
                  <SelectValue placeholder="Context" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inherit">Use app default</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                  <SelectItem value="local">Local knowledge only</SelectItem>
                  <SelectItem value="web">Web search only</SelectItem>
                  <SelectItem value="local_web">Local + web</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5">
                <Switch
                  id="strict-kb"
                  className="scale-90"
                  checked={!!messages.strictKb}
                  onCheckedChange={async (on) => {
                    if (!conversationId) return;
                    await updateConversationStrictKb(conversationId, on);
                    setMessages((prev) =>
                      prev ? { ...prev, strictKb: on } : null
                    );
                  }}
                />
                <Label
                  htmlFor="strict-kb"
                  className="cursor-pointer text-xs text-muted-foreground whitespace-nowrap"
                >
                  Strict KB
                </Label>
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button
              variant="outline"
              size="sm"
              title="Open this conversation in overlay"
              className="h-8 gap-1.5 text-xs font-medium"
              onClick={() =>
                conversationId && handleAttachToOverlay(conversationId)
              }
              disabled={isAttached}
            >
              {isAttached ? (
                <>
                  <Check className="size-3.5 text-green-600" />
                  Attached
                </>
              ) : (
                <>
                  <MessageCircleReplyIcon className="size-3.5" />
                  Overlay
                </>
              )}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 px-2.5 text-xs font-medium"
                  title="More actions"
                >
                  <MoreHorizontal className="size-3.5" />
                  <span className="hidden sm:inline">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[11rem]">
                <DropdownMenuItem
                  disabled={!messages || isDownloaded}
                  onClick={(e) => messages && handleDownload(messages, e)}
                >
                  {isDownloaded ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {isDownloaded ? "Downloaded" : "Export markdown"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!conversationId}
                  onClick={() =>
                    conversationId && handleDeleteConfirm(conversationId)
                  }
                >
                  <Trash2 className="size-4" />
                  Delete conversation
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      }
    >
      {messages?.messages.length === 0 ? (
        <Empty
          isLoading={false}
          icon={MessageCircleIcon}
          title="No messages found"
          description="Start a new message to get started"
        />
      ) : (
        <div className="flex flex-col gap-4 pb-24 px-2">
          {messages?.messages.map((message, index, array) => {
            const isUser = message.role === "user";
            const showDate =
              index === 0 ||
              moment(message.timestamp).format("YYYY-MM-DD") !==
                moment(array[index - 1]?.timestamp).format("YYYY-MM-DD");

            return (
              <div key={message.id}>
                {/* Date separator */}
                {showDate && (
                  <Badge
                    variant={"outline"}
                    className="flex items-center justify-center my-4 w-fit mx-auto"
                  >
                    {moment(message.timestamp).format("ddd, MMM D")}
                  </Badge>
                )}

                {/* Message */}
                <div
                  className={`flex gap-3 ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {/* Avatar - Left side for bot */}
                  {!isUser && (
                    <div className="flex-shrink-0">
                      <div className="size-7 lg:size-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <ZapIcon className="size-3 lg:size-4 text-primary" />
                      </div>
                    </div>
                  )}

                  {/* Message content */}
                  <div
                    className={`flex flex-col gap-1 max-w-[70%] ${
                      isUser ? "items-end" : "items-start"
                    }`}
                  >
                    <Card
                      className={`p-3 text-xs lg:text-sm transition-all shadow-none ${
                        isUser
                          ? "!bg-primary text-primary-foreground !border-primary rounded-tr-sm"
                          : "!bg-muted/50 dark:!bg-muted/30 rounded-tl-sm"
                      }`}
                    >
                      <Markdown>{message.content}</Markdown>
                      {!isUser &&
                        message.knowledgeSources &&
                        message.knowledgeSources.length > 0 && (
                          <details className="mt-2 border-t border-border/50 pt-2 text-[10px] text-muted-foreground">
                            <summary className="cursor-pointer select-none">
                              Sources
                            </summary>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {message.knowledgeSources.map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-left text-[10px] hover:bg-accent"
                                  onClick={() => openKnowledgeSource(s)}
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          </details>
                        )}
                    </Card>
                    <Badge
                      variant="outline"
                      className={`text-[10px] lg:text-xs bg-transparent border-none ${
                        isUser ? "-mr-1" : "-ml-1"
                      }`}
                    >
                      {moment(message.timestamp).format("hh:mm A")}
                    </Badge>
                  </div>

                  {/* Avatar - Right side for user */}
                  {isUser && (
                    <div className="flex-shrink-0">
                      <div className="flex size-7 items-center justify-center rounded-full bg-muted ring-1 ring-border/60 lg:size-8">
                        <UserIcon className="size-3 text-muted-foreground lg:size-4" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={completion.messagesEndRef} />
        </div>
      )}

      {/* Sticky Footer Input */}
      <div className="absolute bottom-0 left-0 right-0 bg-background/10 backdrop-blur">
        {completion.error && (
          <div className="px-4 pt-3 pb-0">
            <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
              <strong>Error:</strong> {completion.error}
            </div>
          </div>
        )}

        <div className="relative flex items-start gap-2 p-4">
          {!hasActiveLicense && (
            <div className="select-none p-5 z-100 bg-primary/5 border border-primary/20 rounded-xl absolute top-4 left-4 right-4">
              <div className="max-w-sm mx-auto">
                <p className="text-sm font-medium text-center">
                  You need an active license to use this feature.
                </p>

                <GetLicense
                  buttonText="Get License"
                  buttonClassName="w-full mt-2"
                />
              </div>
            </div>
          )}
          <div className="relative min-w-0 flex-1">
            {completion.isRecording ? (
              <AudioRecorder
                onTranscriptionComplete={(text) => {
                  completion.setIsRecording(false);
                  completion.submit(text);
                }}
                onCancel={() => completion.setIsRecording(false)}
              />
            ) : (
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card/80 shadow-sm">
                <Textarea
                  ref={completion.inputRef}
                  placeholder="Type a message..."
                  className="min-h-[4.5rem] resize-none rounded-none border-0 bg-transparent px-3 pt-3 pb-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  rows={2}
                  value={completion.input}
                  onChange={(e) => completion.setInput(e.target.value)}
                  onKeyDown={completion.handleKeyPress}
                  onPaste={completion.handlePaste}
                  disabled={completion.isLoading || !hasActiveLicense}
                />
                <div className="flex items-center justify-between gap-2 border-t border-border/50 bg-muted/25 px-1.5 py-1">
                  <div
                    className="flex items-center gap-0.5"
                    role="toolbar"
                    aria-label="Message attachments"
                  >
                    <ChatFiles
                      attachedFiles={completion.attachedFiles}
                      handleFileSelect={completion.handleFileSelect}
                      removeFile={completion.removeFile}
                      onRemoveAllFiles={completion.onRemoveAllFiles}
                      isLoading={completion.isLoading}
                      isFilesPopoverOpen={completion.isFilesPopoverOpen}
                      setIsFilesPopoverOpen={completion.setIsFilesPopoverOpen}
                      disabled={!hasActiveLicense || !supportsImages}
                      triggerVariant="ghost"
                      triggerClassName="size-8 h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    />
                    <ChatAudio
                      micOpen={completion.micOpen}
                      setMicOpen={completion.setMicOpen}
                      isRecording={completion.isRecording}
                      setIsRecording={completion.setIsRecording}
                      disabled={!hasActiveLicense}
                      triggerVariant="ghost"
                      triggerClassName="size-8 h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    />
                    <ChatScreenshot
                      screenshotConfiguration={completion.screenshotConfiguration}
                      attachedFiles={completion.attachedFiles}
                      isLoading={completion.isLoading}
                      captureScreenshot={completion.captureScreenshot}
                      isScreenshotLoading={completion.isScreenshotLoading}
                      disabled={!hasActiveLicense || !supportsImages}
                      triggerVariant="ghost"
                      triggerClassName="size-8 h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-foreground"
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="default"
                    className="size-8 shrink-0 rounded-md"
                    title="Send message"
                    onClick={() => completion.submit()}
                    disabled={
                      completion.isLoading ||
                      !completion.input.trim() ||
                      !hasActiveLicense
                    }
                  >
                    {completion.isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <SendIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        deleteConfirm={deleteConfirm}
        cancelDelete={cancelDelete}
        confirmDelete={handleDelete}
      />
    </PageLayout>
  );
};

export default View;
