# ファミサポ依頼日一覧

翌月のファミリー・サポート・センターへのお迎え依頼日を、スマートフォンで選択・確認し、LINE用文章とPNG画像を作る静的Webアプリです。サーバーやデータベースは使用しません。

## 使い方

1. 対象年月を確認または変更します（初期値は翌月です）。
2. カレンダーの日付をタップして依頼日を選択します。月曜から木曜は最初から選択されています。
3. 送信内容の確認欄、LINE用文章、概算金額を確認します。
4. 「文章をコピー」でLINEへ貼り付けます。
5. 「PNG画像を生成」を押し、「PNG画像を保存」または共有シートからLINEへ送ります。

概算金額はアプリ画面だけに表示され、LINE文章とPNG画像には含まれません。

## ローカルでの確認

ブラウザのセキュリティ制限を避けるため、簡易サーバーで開いてください。

```sh
cd famisapo-request-calendar
python3 -m http.server 8000
```

`http://localhost:8000` を開きます。

日付処理のテストは次で実行できます。

```sh
npm test
```

## GitHub Pagesへの公開

1. GitHubで新しいリポジトリを作成します（例: `famisapo-request-calendar`）。
2. このフォルダ内のファイルをリポジトリに追加して、`main` ブランチへpushします。
3. GitHubのリポジトリで **Settings** → **Pages** を開きます。
4. **Build and deployment** の **Source** に **Deploy from a branch** を選びます。
5. Branchに **main**、Folderに **/(root)** を選び、**Save** を押します。
6. 数分後に表示される公開URLをiPhoneのSafariで開きます。

公開に必要なビルド処理や環境変数はありません。`index.html` が公開の入口です。
