/* データの置き場所。config.js に Supabase の情報があればそこへ保存し、無ければこの端末だけに保存する */
const Data = (() => {
  const C = window.EIGYO_CONFIG || {};
  const online = !!(C.supabaseUrl && C.supabaseKey && window.supabase);
  const LS = { recs: "eigyo-recs", profile: "eigyo-profile", rules: "eigyo-rules", members: "eigyo-members" };
  const lget = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch (e) { return d } };
  const lset = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} };
  let sb = null, me = null, chan = null;
  const must = r => { if (r.error) throw r.error; return r.data };

  return {
    online,
    async session() {
      if (!online) return { me: "local" };
      sb = supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
      const { data } = await sb.auth.getSession();
      me = data.session ? data.session.user.id : null;
      return { me, email: data.session ? data.session.user.email : "" };
    },
    async signIn(email, password) {
      const d = must(await sb.auth.signInWithPassword({ email, password }));
      me = d.user.id; return me;
    },
    // 確認メールが要る設定の時は null を返す
    async signUp(email, password, name) {
      const d = must(await sb.auth.signUp({ email, password, options: { data: { name } } }));
      if (!d.session) return null;
      me = d.user.id; return me;
    },
    // この端末だけに保存していた記録と規程を、ログインした人の分として送る
    async moveLocal() {
      if (!online) return 0;
      const list = Object.values(lget(LS.recs, {})).filter(r => r && r.id);
      if (list.length) {
        must(await sb.from("records").upsert(list.map(r => ({ id: r.id, user_id: me, data: r, updated_at: new Date().toISOString() }))));
        try { localStorage.removeItem(LS.recs) } catch (e) {}
      }
      const rules = lget(LS.rules, null);
      if (rules) {
        const cur = must(await sb.from("settings").select("key").eq("key", "rules"));
        if (!cur.length) { try { must(await sb.from("settings").insert({ key: "rules", data: rules })) } catch (e) { return list.length } }
        try { localStorage.removeItem(LS.rules) } catch (e) {}
      }
      return list.length;
    },
    async signOut() { if (chan) sb.removeChannel(chan); await sb.auth.signOut(); me = null },

    async loadAll() {
      if (!online) return {
        isAdmin: false, profiles: { local: lget(LS.profile, {}) }, recs: { local: lget(LS.recs, {}) }, appr: {},
        rules: lget(LS.rules, null), members: lget(LS.members, {})
      };
      const [p, r, a, s] = await Promise.all([
        sb.from("profiles").select("*"), sb.from("records").select("id,user_id,data"),
        sb.from("approvals").select("record_id,user_id,data"), sb.from("settings").select("key,data")]);
      const profiles = {}, recs = {}, appr = {}, set = {};
      must(p).forEach(x => { profiles[x.id] = x; recs[x.id] = recs[x.id] || {} });
      must(r).forEach(x => { (recs[x.user_id] = recs[x.user_id] || {})[x.id] = x.data });
      must(a).forEach(x => { (appr[x.user_id] = appr[x.user_id] || {})[x.record_id] = x.data });
      must(s).forEach(x => { set[x.key] = x.data });
      return { isAdmin: !!(profiles[me] && profiles[me].is_admin), profiles, recs, appr,
        rules: set.rules || null, members: (set.members && set.members.map) || {} };
    },
    async saveRec(all, rec) {
      if (!online) return lset(LS.recs, all);
      must(await sb.from("records").upsert({ id: rec.id, user_id: me, data: rec, updated_at: new Date().toISOString() }));
    },
    async deleteRec(all, id) {
      if (!online) return lset(LS.recs, all);
      must(await sb.from("records").delete().eq("id", id));
    },
    async saveProfile(p) {
      if (!online) return lset(LS.profile, p);
      must(await sb.from("profiles").update({ name: p.name || "", dept: p.dept || "", home: p.home || "" }).eq("id", me));
    },
    async saveSetting(key, data) {
      if (!online) return lset(key === "rules" ? LS.rules : LS.members, key === "members" ? data.map : data);
      must(await sb.from("settings").upsert({ key, data, updated_at: new Date().toISOString() }));
    },
    async setApproval(uid, id, doc) {
      if (doc) must(await sb.from("approvals").upsert({ record_id: id, user_id: uid, data: doc }));
      else must(await sb.from("approvals").delete().eq("record_id", id));
    },
    // 規程のファイルを読み取って、規程の形で返す（つないでいればサーバーの read-rules、いなければ端末の鍵で）
    async readRules(file) {
      const part = await RulesAI.part(file);
      if (!online) return RulesAI.direct(part);
      const { data: d, error } = await sb.functions.invoke("read-rules", { body: { part } });
      if (error) { let code = "fail"; try { code = (await error.context.json()).error || code } catch (e) {} throw new Error(code) }
      return d.rules;
    },
    // 他の端末で変わった時に知らせる
    watch(cb) {
      if (!online) return;
      chan = sb.channel("eigyo");
      ["records", "approvals", "settings", "profiles"].forEach(t =>
        chan.on("postgres_changes", { event: "*", schema: "public", table: t }, () => cb(t)));
      chan.subscribe();
    }
  };
})();
