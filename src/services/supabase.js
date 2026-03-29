import { createClient } from "@supabase/supabase-js";
import { normalizeTxnDate } from "../utils/date";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const GS = {
  load: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    return data || [];
  },
  migrateDates: async (rows) => {
    const updates = rows
      .filter((r) => r?.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date))
      .map(async (r) => {
        const normalized = normalizeTxnDate(r.date);
        if (!normalized || normalized === r.date) return;
        await supabase.from("transactions").update({ date: normalized }).eq("id", r.id);
      });
    await Promise.all(updates);
  },
  add: async (tx) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("transactions")
      .insert({
        id: tx.id,
        user_id: user.id,
        amount: tx.amount,
        merchant: tx.merchant,
        date: tx.date,
        image_url: tx.image_url || null,
      });
  },
  del: async (id) => {
    await supabase.from("transactions").delete().eq("id", id);
  },
  update: async (tx) => {
    await supabase
      .from("transactions")
      .update({ amount: tx.amount, merchant: tx.merchant, date: tx.date })
      .eq("id", tx.id);
  },
};

export const US = {
  load: async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();
    return data;
  },
  save: async (cfg, userId) => {
    await supabase.from("user_settings").upsert({
      user_id: userId,
      project_name: cfg.projectName || "",
      email: cfg.email || "",
      threshold: cfg.threshold || 50000,
      updated_at: new Date().toISOString(),
    });
  },
};

export const compress = (url, px = 900) =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const sc = Math.min(1, px / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = img.width * sc;
      c.height = img.height * sc;
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL("image/jpeg", 0.7));
    };
    img.src = url;
  });

export const uploadReceipt = async (userId, txId, dataUrl) => {
  try {
    const base64 = dataUrl.split(",")[1];
    const mime = dataUrl.split(";")[0].split(":")[1];
    const ext = mime === "image/png" ? "png" : "jpg";
    const path = `${userId}/${txId}.${ext}`;
    const blob = await fetch(dataUrl).then((r) => r.blob());
    const { error } = await supabase.storage.from("receipts").upload(path, blob, {
      contentType: mime,
      upsert: true,
    });
    if (error) return null;
    const { data } = supabase.storage.from("receipts").getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
};
