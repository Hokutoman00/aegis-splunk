# Splunk Enterprise ローカル install ガイド (ユーザー作業手順)

Claude が代行できたのは EULA accept と MSI download まで。以下は user 手作業が必要な範囲。

## 1. 前提

- **Download 済み**: `C:\Users\hokut\Downloads\splunk-10.4.0-f798d4d49089-windows-x64.msi` (約 1 GB、BITS で取得)
- **無料 60 日 + 60 日後は永久無料 license** (500 MB/Day index 制限)。CC 不要、契約解約も不要
- **Port 衝突なし要件**: 8000 (Web UI), 8088 (HEC), 8089 (管理), 9997 (forwarder) が空いてること

Port 衝突確認:
```powershell
Get-NetTCPConnection -State Listen -LocalPort 8000,8088,8089,9997 -ErrorAction SilentlyContinue
```
何も出なければ OK。

## 2. MSI install

1. `splunk-10.4.0-f798d4d49089-windows-x64.msi` を **右クリック → 管理者として実行**
2. License agreement に同意
3. インストール先: default `C:\Program Files\Splunk\` で OK
4. **Admin Account 設定**: username/password を聞かれる
   - Username: `admin` 推奨
   - Password: **要メモ** (任意の強いパスワードを設定。aegis-splunk env に書き込む必要あり)
5. SSL: default `Yes` (HTTPS)
6. Install → 完了まで 3-5 分

## 3. 動作確認

- ブラウザで `http://localhost:8000` を開く (HTTPS 化されたら https に)
- 上記の admin / password で login
- 左下に "Splunk Enterprise Trial — 60 days remaining" 表示が出れば成功

## 4. HEC (HTTP Event Collector) 有効化

aegis-splunk が Splunk に audit event を送るために必須。

1. 右上歯車 → **Settings → Data inputs**
2. **HTTP Event Collector** をクリック
3. 右上 **Global Settings** ボタン:
   - All Tokens: **Enabled**
   - Default Source Type: そのまま
   - Default Index: `main`
   - HTTP Port Number: `8088` (default)
   - Enable SSL: Off (local 開発用、production は On)
   - Save
4. 右上 **New Token** ボタン:
   - Name: `aegis-hec`
   - Description: `aegis-splunk audit events`
   - Source name override: 空
   - Output Group: 空
   - Next →
   - **Allowed Indexes**: `main` を選択
   - Default Index: `main`
   - Review → Submit
5. 表示される **Token UUID をコピー** (例 `8b8a7c2e-1234-5678-90ab-cdef01234567`)

## 5. aegis-splunk 側の env 設定

`c:/Users/hokut/Desktop/aegis-splunk/.env` を作成 (or 編集):

```env
SPLUNK_HEC_URL=http://localhost:8088/services/collector
SPLUNK_HEC_TOKEN=<上記でコピーした UUID>
SPLUNK_HEC_SOURCE=aegis
SPLUNK_HEC_SOURCETYPE_CHAOS=aegis:chaos
SPLUNK_HEC_SOURCETYPE_MCP=aegis:mcp-failover
SPLUNK_HEC_INDEX=main
```

## 6. 接続テスト

aegis-splunk repo で:

```powershell
cd C:\Users\hokut\Desktop\aegis-splunk
bun run scripts/test-hec-connection.ts
```

または直接 curl:

```powershell
$token = "<UUID>"
curl -k "http://localhost:8088/services/collector/event" `
  -H "Authorization: Splunk $token" `
  -d '{"event": "test from aegis-splunk", "sourcetype": "aegis:chaos"}'
```

期待 response: `{"text":"Success","code":0}`

Splunk UI で確認: Search & Reporting → `index=main sourcetype=aegis:chaos` → 1 event が出ればパス。

## 7. demo 録画前 checklist

- [ ] Splunk Web (localhost:8000) 表示
- [ ] HEC token 有効化済
- [ ] aegis-splunk から HEC connection test 通過
- [ ] `bash examples/demo.sh` 動作 → Splunk に event 流入確認
- [ ] OBS で localhost:8000 + Aegis terminal の split screen 録画

## トラブル

| 症状 | 原因 / 対策 |
|---|---|
| `localhost:8000` 開かない | Service 起動失敗。コマンドプロンプト admin で `C:\Program Files\Splunk\bin\splunk.exe status` |
| HEC POST が 403 | token が無効 / Global Settings の "All Tokens: Disabled" |
| Token を忘れた | Settings → Data inputs → HTTP Event Collector → 該当 token クリックで再表示 |
| Port 8000 衝突 | install 時に別ポート指定 (8001 等)。aegis env も変更要 |
| Service 自動起動しない | `services.msc` で "Splunkd Service" を Automatic に |

## 60 日後

無料 license 自動切替の prompt が出る。Free license は 500 MB/Day 制限以外は機能フル。
contest demo 録画は 60 日以内で十分。
