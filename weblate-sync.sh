#!/bin/sh

PROJECT="pay-app"
COMPONENT="app"
PUSH_SOURCE=false
PULL_TRANSLATIONS=""
FOLDER="src/i18n/"
while [ $# -gt 0 ]; do
    key="$1"
    case $key in
        --pushSource)
            PUSH_SOURCE=true
            ;;
        --pullTranslations=*)
            PULL_TRANSLATIONS="${key#*=}"
            ;;
        --folder=*)
            FOLDER="${key#*=}"
            ;;
        *)
            ;;
    esac
    shift
done

# The format is compatible with what the Weblate Client wlc uses: https://docs.weblate.org/en/latest/wlc.html#wlc-config
CONFIG_FILE="$(dirname "$0")/.weblate"
API_URL=""
API_KEY=""
if [ -f "$CONFIG_FILE" ]; then
    WEBLATE_CONFIG=$(cat "$CONFIG_FILE" | sed '/^\[weblate]$/,/^\[.*]$/! d;
        /^\[weblate]$/ d;
        /^\[.*]$/ d;')
    API_URL=$(echo "$WEBLATE_CONFIG" | sed '/url *= */! d; s/url *= *//')
    API_KEY=$(echo "$WEBLATE_CONFIG" | sed '/key *= */! d; s/key *= *//')
else
    echo "Error: config file .weblate not found"
    exit 1
fi

if [ -z "$API_URL" ]; then
    echo "Error: api url unspecified"
    exit 1
fi
if [ -z "$API_KEY" ]; then
    echo "Error: api key unspecified"
    exit 1
fi

if [ "$PUSH_SOURCE" = true ]; then
    # Post the source file as Content-Type multipart/form-data.
    # We're declaring it as source file via method=source which causes it to be merged into translation files via
    # gettext msgmerge (see https://docs.weblate.org/en/latest/user/files.html#import-methods). No need to specify
    # conflict handling of translations or handling of fuzzy strings, as the source file should not contain any
    # translations or fuzzy strings.
    # See https://docs.weblate.org/en/latest/api.html#post--api-translations-(string-project)-(string-component)-(string-language)-file-
    curl --header "Authorization: Token $API_KEY" \
        --form "file=@${FOLDER}en.po" \
        --form method=source \
        "${API_URL}translations/${PROJECT}/${COMPONENT}/en/file/" \
        | cat # Avoid curl progress meter being disabled if the output is not piped somewhere. We pipe it back to stdout
fi

if [ ! -z "$PULL_TRANSLATIONS" ]; then
    # See https://docs.weblate.org/en/latest/api.html#get--api-translations-(string-project)-(string-component)-(string-language)-file-
    # Files are pulled in parallel in a single curl invocation via curl { } globbing.
    curl --header "Authorization: Token $API_KEY" \
        --parallel \
        --parallel-immediate \
        --output "${FOLDER}#1.po" \
        "${API_URL}translations/${PROJECT}/${COMPONENT}/{${PULL_TRANSLATIONS}}/file/"

    for language in $(echo "$PULL_TRANSLATIONS" | sed "s/,/ /g"); do
        awk ' BEGIN {p=1} /^$/ {p=0} p && /^\s*Language-Team/ {next} p {gsub(/ <[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}>(,)?/,"")} 1 ' "${FOLDER}${language}.po" > temp && mv temp "${FOLDER}${language}.po"
    done
fi
