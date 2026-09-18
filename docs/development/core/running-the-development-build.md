# Running the development build

Install Git and the Node version in `.nvmrc`, currently Node 24. From a checkout of Hibi, run:

```sh
npm ci
npm run dev
```

The development app uses a separate data profile. React and CSS changes update while it runs. Changes to addon runtimes or preload code reload the window and retain drafts. Main-process changes restart the app, so save your work before editing those files.

The development command also watches the HTML exporter and generated API documentation. Restart it after adding a new addon folder.

## Preview a production build

```sh
npm run build
npm run preview
```

Use this when checking behavior that may differ from development, such as startup time or bundled assets.

## Use a separate profile

Pass Electron arguments after the extra separator:

```sh
npm run dev -- -- --user-data-dir=/path/to/test-profile
```

Use a new profile when testing first launch or default settings. Avoid sharing a profile between running instances.
