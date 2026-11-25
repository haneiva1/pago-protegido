// Payloads de ejemplo de la documentación de Kapso, copiados el 24-nov-2026 (sin los campos `last_…_at` que
// cambian de un ejemplo a otro y el bot no lee).
// - https://docs.kapso.ai/docs/platform/webhooks/message-events.md (recibido, entregado, fallido, standby, botón, audio)
// - https://docs.kapso.ai/docs/platform/webhooks/advanced.md (lote)
// - https://docs.kapso.ai/api/meta/whatsapp/messages/send-a-message.md y /docs/whatsapp/conversation-routing.md (errores)

/** El phone_number_id de todos los ejemplos. */
export const PHONE_ID = "123456789012345";

const conversation = {
  id: "conv_123",
  contact_name: "John Doe",
  phone_number: "16315551181",
  business_scoped_user_id: "US.13491208655302741918",
  parent_business_scoped_user_id: "US.ENT.506847293015824",
  username: "@testusername",
  status: "active",
  last_active_at: "2025-10-28T14:25:01-03:00",
  created_at: "2025-10-28T13:40:00-03:00",
  updated_at: "2025-10-28T14:25:01-03:00",
  metadata: {},
  phone_number_id: PHONE_ID,
};

/** whatsapp.message.received */
export const recibido = {
  message: {
    id: "wamid.123",
    timestamp: "1730092800",
    type: "text",
    from: "16315551181",
    from_user_id: "US.13491208655302741918",
    from_parent_user_id: "US.ENT.506847293015824",
    username: "@testusername",
    text: { body: "Hello" },
    kapso: { direction: "inbound", status: "received", processing_status: "pending", origin: "cloud_api", has_media: false, content: "Hello" },
  },
  conversation: {
    ...conversation,
    kapso: {
      messages_count: 1,
      last_message_id: "wamid.123",
      last_message_type: "text",
      last_message_timestamp: "2025-10-28T17:25:01.000000Z",
      last_message_text: "Hello",
      last_inbound_at: "2025-10-28T17:25:01.000000Z",
      last_outbound_at: null,
    },
  },
  is_new_conversation: true,
  phone_number_id: PHONE_ID,
};

const alCliente = { ...conversation, phone_number: "15551234567" };

/** whatsapp.message.delivered */
export const entregado = {
  message: {
    id: "wamid.456",
    timestamp: "1730092888",
    type: "text",
    to: "15551234567",
    text: { body: "On my way" },
    kapso: {
      direction: "outbound",
      status: "delivered",
      processing_status: "completed",
      origin: "cloud_api",
      has_media: false,
      statuses: [
        { id: "wamid.456", status: "sent", timestamp: "1730092860", recipient_id: "15551234567" },
        { id: "wamid.456", status: "delivered", timestamp: "1730092888", recipient_id: "15551234567" },
      ],
    },
  },
  conversation: alCliente,
  is_new_conversation: false,
  phone_number_id: PHONE_ID,
};

/** whatsapp.message.failed */
export const fallido = {
  message: {
    id: "wamid.789",
    timestamp: "1730093200",
    type: "text",
    to: "15551234567",
    text: { body: "This message failed" },
    kapso: {
      direction: "outbound",
      status: "failed",
      processing_status: "completed",
      origin: "cloud_api",
      has_media: false,
      statuses: [
        { id: "wamid.789", status: "sent", timestamp: "1730093100", recipient_id: "15551234567" },
        {
          id: "wamid.789",
          status: "failed",
          timestamp: "1730093200",
          recipient_id: "15551234567",
          errors: [{ code: 131047, title: "Re-engagement message", message: "More than 24 hours have passed since the recipient last replied" }],
        },
      ],
    },
  },
  conversation: alCliente,
  is_new_conversation: false,
  phone_number_id: PHONE_ID,
};

const enLote = (id: string, timestamp: string, body: string, hora: string) => ({
  message: {
    id,
    timestamp,
    type: "text",
    text: { body },
    kapso: { direction: "inbound", status: "received", processing_status: "pending", origin: "cloud_api", phone_number: "+15551234567", phone_number_id: PHONE_ID },
  },
  conversation: {
    id: "conv_123",
    phone_number: "+15551234567",
    status: "active",
    last_active_at: hora,
    created_at: "2025-10-28T13:40:00Z",
    updated_at: hora,
    metadata: {},
    phone_number_id: PHONE_ID,
  },
  is_new_conversation: false,
  phone_number_id: PHONE_ID,
});

/** Lote (buffering activado): los mensajes no traen `from`. */
export const lote = {
  type: "whatsapp.message.received",
  batch: true,
  data: [enLote("wamid.111", "1730092801", "First in batch", "2025-10-28T14:26:01Z"), enLote("wamid.112", "1730092802", "Second in batch", "2025-10-28T14:26:02Z")],
  batch_info: { size: 2, window_ms: 5000, first_sequence: 101, last_sequence: 102, conversation_id: "conv_123" },
};

/** whatsapp.thread.standby: un mensaje que atiende otra app. */
export const standby = {
  standby: { kind: "message_received" },
  message: {
    id: "wamid.789",
    timestamp: "1730092800",
    type: "text",
    from: "16315551181",
    text: { body: "I need to change my delivery address" },
    kapso: { direction: "inbound", status: "received", processing_status: "processed", origin: "cloud_api", has_media: false, passive: true },
  },
  conversation: {
    id: "conv_123",
    phone_number: "16315551181",
    status: "active",
    phone_number_id: PHONE_ID,
    kapso: { thread: { ownership: "other_app", owner_role: "customer_service", passive: true } },
  },
  is_new_conversation: false,
  phone_number_id: PHONE_ID,
};

/** whatsapp.conversation.ended: sin mensaje. */
export const terminada = { conversation: { ...conversation, id: "conv_789", status: "ended" }, phone_number_id: PHONE_ID };

/** Botón de respuesta (campos del ejemplo "Interactive messages"). */
export const boton = { type: "interactive", text: undefined, interactive: { type: "button_reply", button_reply: { id: "btn_1", title: "Confirm" } } };

/** Audio (campos del ejemplo "Audio messages"). */
export const audio = { type: "audio", text: undefined, audio: { id: "media_id_456" } };

/** 401/400: la forma de Meta. */
export const errorFormaMeta = { error: { message: "Invalid phone number format", type: "OAuthException", code: 400, error_subcode: 1001 } };
/** 422: fuera de la ventana de 24 horas. */
export const errorVentana = { error: { message: "Cannot send non-template messages outside the 24-hour window.", type: "MessageError", code: 131047, error_subcode: 131047, fbtrace_id: "AXk7s_8dR4eVHp9Kq2MmNlO" } };
/** 402: sin saldo en el proyecto. */
export const errorSaldo = { error: "Your Kapso balance doesn't cover Meta's fee for this message.", code: "insufficient_credits", billing_url: "https://app.kapso.ai/projects/00000000-0000-0000-0000-000000000000/billing" };
/** 409: todavía está saliendo otro mensaje para esa persona. */
export const errorEnVuelo = { error: "Another message is already in-flight for this conversation. Please retry shortly." };
/** 409: el chat lo tiene otra app. */
export const errorChatAjeno = { error: "Another app controls this conversation. Automated Service messages are blocked; templates are still allowed.", code: "thread_not_owner", thread_error: "thread_not_owner" };
/** 429 */
export const errorRitmo = { error: "Rate limit exceeded", message: "You have exceeded the rate limit. Please try again later." };
