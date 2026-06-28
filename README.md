# ×ボタン候補を探す

広告やポップアップの閉じるボタン候補を探し、画面上に赤いリングで表示する Chrome 拡張機能です。

この拡張機能は閉じるボタンを自動クリックしません。表示された候補をユーザーが確認し、必要なものだけクリックします。

## 入手先

通常はChrome ウェブストア版の利用をおすすめします。

Chrome ウェブストア:
https://chromewebstore.google.com/detail/clmpgppinmjonoadlbgkjpjhkodghjlb?utm_source=item-share-cb

GitHub Releasesでは、更新履歴と過去バージョンを確認できます。

https://github.com/bunjicompany/where-is-close-button/releases

## 使い方

1. [Chrome ウェブストア](https://chromewebstore.google.com/detail/clmpgppinmjonoadlbgkjpjhkodghjlb?utm_source=item-share-cb)から「バツどこ？」を追加する
2. 広告やポップアップが出たページを開く
3. Chrome ツールバーの拡張機能アイコンを押す
4. ポップアップ内の「×ボタン候補を探す」を押す
5. 赤い番号付きリングで表示された候補を確認してクリックする

ショートカットは Windows/Linux が `Ctrl+Shift+X`、macOS が `Command+Shift+X` です。

## 機能

- ページ内と iframe 内の閉じるボタン候補を検出
- 候補をクリック順の番号付きリングで表示
- クリック後に候補要素が消えた場合、対応するリングを自動で消去
- 12 秒後に表示を自動で消去

## 注意

これは候補を示す支援ツールです。広告によっては偽のボタン、遅延表示、画像や CSS で作られた閉じるボタンがあり、必ず正しい候補だけを判定できるわけではありません。

## よくあるケース

- 候補が複数出る場合があります。番号の若い候補から確認してください。
- 画像だけで作られた閉じるボタンや、時間差で表示されるボタンは検出できない場合があります。
- この拡張機能は候補を表示するだけで、自動クリックは行いません。

## プライバシー

この拡張機能は、閲覧履歴、ページ内容、クリック情報、個人情報を外部サーバーへ送信しません。詳しくは [PRIVACY.md](PRIVACY.md) を参照してください。
