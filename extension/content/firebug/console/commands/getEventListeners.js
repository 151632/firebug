/* See license.txt for terms of usage */
/*global define:1*/

define([
    "firebug/firebug",
    "firebug/lib/trace",
    "firebug/lib/locale",
    "firebug/lib/wrapper",
    "firebug/lib/xpcom",
    "firebug/lib/events",
],
function(Firebug, FBTrace, Locale, Wrapper, Xpcom, Events) {

"use strict";

// ********************************************************************************************* //
// Constants

const comparator = Xpcom.CCSV("@mozilla.org/xpcom/version-comparator;1", "nsIVersionComparator");
const appInfo = Xpcom.CCSV("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
var pre23 = (comparator.compare(appInfo.version, "23.0*") < 0);

// ********************************************************************************************* //
// Command Implementation

function onExecuteCommand(context, args)
{
    var target = args[0];
    if (typeof target !== "object" || target === null)
        return undefined;

    if (pre23 && !context.getPanel("script", true))
    {
        // XXXsimon: Don't bother translating this, it will go away in one release,
        // happen very seldom, and English error messages look better anyway.
        throw new Error("getEventListeners requires the Script panel to be enabled " +
            "(or the use of Firefox 23 or higher)");
    }

    var listeners;
    try
    {
        listeners = Events.getEventListenersForTarget(target);
    }
    catch (exc)
    {
        if (FBTrace.DBG_COMMANDLINE)
            FBTrace.sysout("getEventListenersForTarget threw an exception", exc);

        return undefined;
    }

    // Sort listeners by type in alphabetical order, so they show up as such
    // in the returned object.
    listeners.sort(function(a, b)
    {
        if (a.type === b.type)
            return 0;
        return (a.type < b.type ? -1 : 1);
    });

    try
    {
        var global = context.getCurrentGlobal();
        var ret = {};
        for (let li of listeners)
        {
            if (!ret[li.type])
                ret[li.type] = [];

            ret[li.type].push(Wrapper.cloneIntoContentScope(global, {
                listener: li.func,
                useCapture: li.capturing
            }));
        }

        // Append also mutation observers into the result if there are any.
        var observers = getMutationObserversForTarget(context, target);
        if (observers.length > 0)
        {
            // xxxHonza: localization?
            ret["Mutation Observers"] = observers;
        }

        return Wrapper.cloneIntoContentScope(global, ret);
    }
    catch (exc)
    {
        if (FBTrace.DBG_ERRORS)
            FBTrace.sysout("getEventListeners FAILS to create content view" + exc, exc);
    }

    return undefined;
}

// ********************************************************************************************* //
// Mutation Observers

function getMutationObserversForTarget(context, target)
{
    var result = [];

    // xxxHonza: Firefox 26+ should be the minimum for Firebug 1.13, so
    // this condition should disappear eventually.
    if (typeof(target.getBoundMutationObservers) !== "function")
    {
        var msg = "ERROR not supported by the current version of " +
            "Firefox (see: https://bugzilla.mozilla.org/show_bug.cgi?id=912874)";

        FBTrace.sysout("getMutationObservers: " + msg);
        Firebug.Console.logFormatted([msg], context, "warn");

        return result;
    }

    var global = context.getCurrentGlobal();
    var observers = target.getBoundMutationObservers();
    for (var i=0; i<observers.length; i++)
    {
        var observer = observers[i];
        var infos = observer.getObservingInfo();
        for (var j=0; j<infos.length; j++)
        {
            var info = infos[j];
            result.push(Wrapper.cloneIntoContentScope(global, {
                attributeOldValue: info.attributeOldValue,
                attributes: info.attributes,
                characterData: info.characterData,
                characterDataOldValue: info.characterDataOldValue,
                childList: info.childList,
                subtree: info.subtree,
                observedNode: info.observedNode,
                mutationCallback: observer.mutationCallback,
            }));
        }
    }

    return result;
}

// ********************************************************************************************* //
// Registration

Firebug.registerCommand("getEventListeners", {
    helpUrl: "https://getfirebug.com/wiki/index.php/getEventListeners",
    handler: onExecuteCommand.bind(this),
    description: Locale.$STR("console.cmd.help.getEventListeners")
});

return {
    getEventListeners: onExecuteCommand
};

// ********************************************************************************************* //
});
