/**
 * ToDo追加確認Quick Reply（print-flow.tsのbuildTodoPromptMessage）のpostback受信時の処理。
 * dataは他フローの固定文字列と違い `action=todo_add&print_id=...&reminder=...` のクエリ文字列形式で、
 * 他フローのpostback定数（例："book_register_start"）と衝突しない。
 */
import { supabase } from "./clients.ts"
import { replyLine, textMessage } from "../_shared/line-client.ts"

export async function handleTodoAction(replyToken: string, data: string): Promise<void> {
  const params  = new URLSearchParams(data)
  const action  = params.get("action")
  const printId = params.get("print_id")

  if (!printId) {
    await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
    return
  }

  if (action === "todo_add") {
    const reminderEnabled = params.get("reminder") === "true"

    // 対象printに紐づく、日付ありのprint_eventsを取得（1枚に複数日程あれば全件まとめてToDo化する）
    const { data: targetEvents, error } = await supabase
      .from("print_events")
      .select("id, title, event_date, category")
      .eq("print_id", printId)
      .not("event_date", "is", null)

    if (error) {
      console.error("[handleTodoAction] print_events fetch error", error)
      await replyLine(replyToken, [textMessage("エラーが発生しました。もう一度試してください。")])
      return
    }

    const todosToInsert = (targetEvents ?? []).map((e) => ({
      print_event_id:   e.id,
      title:            e.title,
      due_date:         e.event_date,
      category:         e.category,
      reminder_enabled: reminderEnabled,
      todo_enabled:     true,
    }))

    if (todosToInsert.length === 0) {
      await replyLine(replyToken, [textMessage("ToDo化できる日程が見つかりませんでした。")])
      return
    }

    // print_event_idにUNIQUE制約があるため、Quick Replyの二重タップやLINEのwebhook再送で
    // このハンドラが2回走っても、ignoreDuplicatesにより既存のtodoは上書き・重複作成されない
    const { data: insertedRows, error: insertError } = await supabase
      .from("todos")
      .upsert(todosToInsert, { onConflict: "print_event_id", ignoreDuplicates: true })
      .select("id")
    if (insertError) {
      console.error("[handleTodoAction] todos insert error", insertError)
      await replyLine(replyToken, [textMessage("ToDoの登録中にエラーが発生しました。もう一度試してください。")])
      return
    }

    const addedCount = insertedRows?.length ?? 0
    await replyLine(replyToken, [
      textMessage(
        addedCount > 0
          ? `✅ ${addedCount}件をToDoに追加しました${reminderEnabled ? "（リマインドON）" : ""}`
          : "既にToDoに追加済みです",
      ),
    ])
    return
  }

  if (action === "todo_skip") {
    await replyLine(replyToken, [textMessage("📝 記録のみ登録しました（ToDo追加なし）")])
    return
  }
}
