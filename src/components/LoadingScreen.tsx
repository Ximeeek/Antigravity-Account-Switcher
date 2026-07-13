/**
 * App loading screen component.
 * Rendered when the app is initializing and retrieving the app state from the backend.
 * Main exports: LoadingScreen
 */

import { Icon } from "./Icons";
import { t } from "../i18n";

export default function LoadingScreen() {
  return (
    <main className="boot-screen" aria-busy="true" aria-label={t("loading_profiles")}>
      <div className="boot-screen__mark">
        <Icon name="loader" size={27} />
      </div>
      <h1>{t("loading_profiles")}</h1>
      <p>{t("checking_status")}</p>
    </main>
  );
}
