#!/bin/sh

# Read command line arguments
PROJECT="pay-app"
COMPONENT="app"
PUSH_SOURCE=false # true or false
PULL_TRANSLATIONS="" # comma separated list of languages
FOLDER="src/i18n/"
while [ $# -gt 0 ]; do
    key="$1"
    case $key in
        --pushSource)
            # --pushSource flag is set
            PUSH_SOURCE=true
            ;;
        --pullTranslations=*)
            # --pullTranslations=<comma-separated-languages> is set. Read the languages.
            PULL_TRANSLATIONS="${key#*=}"
            ;;
        --folder=*)
            # --folder=<folder> is set. Read the folder.
            FOLDER="${key#*=}"
            ;;
        *)
            # Ignore other flags/arguments
            ;;
    esac
    shift # Shift to the next argument
done

# Read Weblate config that contains the user's api key and the Weblate instance's URL which should not be public.
# The format is compatible with what the Weblate Client wlc uses: https://docs.weblate.org/en/latest/wlc.html#wlc-config
CONFIG_FILE="$(dirname "$0")/.weblate" # We expect a per-project config file.
API_URL=""
API_KEY=""
if [ -f "$CONFIG_FILE" ]; then
    # Parse INI file.
    # Read file and discard anything but weblate section, which starts by [weblate] header and ends on next [.*] section
    # header or end of file.
    WEBLATE_CONFIG=$(cat "$CONFIG_FILE" | sed '/^\[weblate]$/,/^\[.*]$/! d; # del outside [weblate],[next-header] range
        /^\[weblate]$/ d; # delete [weblate] header itself
        /^\[.*]$/ d # delete next header itself')
    API_URL=$(echo "$WEBLATE_CONFIG" | sed '/url *= */! d; s/url *= *//') # del lines other than url=.. and strip "url="
    API_KEY=$(echo "$WEBLATE_CONFIG" | sed '/key *= */! d; s/key *= *//') # del lines other than key=.. and strip "key="
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

# Push source files
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

# Pull translations
if [ ! -z "$PULL_TRANSLATIONS" ]; then
    # Pull the translation files.
    # See https://docs.weblate.org/en/latest/api.html#get--api-translations-(string-project)-(string-component)-(string-language)-file-
    # Files are pulled in parallel in a single curl invocation via curl { } globbing.
    curl --header "Authorization: Token $API_KEY" \
        --parallel \
        --parallel-immediate \
        --output "${FOLDER}#1.po" \
        "${API_URL}translations/${PROJECT}/${COMPONENT}/{${PULL_TRANSLATIONS}}/file/"

    # Remove translator's email addresses and Language-Team entry from translation files.
    for language in $(echo "$PULL_TRANSLATIONS" | sed "s/,/ /g"); do
        sed --in-place -e '0,/^$/ { # Within first paragraph, starting from first line until first empty line,
            s/ \?[^ ]\+@[^ ]\+\.[^ \]\+//g; # remove all email addresses
            /Language-Team/ d # and delete Language-Team line which exposes the url of our internal Weblate instance.
        }' "${FOLDER}${language}.po"
    done
fi
