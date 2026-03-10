require( [ 'ko', 'jquery', 'Sammy', '����', '�˻���_Ȩ������' ], function(ko, $, Sammy, CM, Application) {
    /* ���ø����̼� */
    var application = this.app = new Application();

    $(function() {
        application.documentReady();

        var $target = $('#rySearch2015_wrap'), binder = function() {
            ko.applyBindings(application, $target[0]);
            ko.applyBindings(application, $("#targetXP")[0]);

            $target.css('visibility', 'visible');
        }, firstUpdate = true, legacyParam = $target.data('legacyParam');

        /* ���� �˻����� �Ķ���� ��ȯ�Ͽ� ���̹��� ������ ��ȯ */
        if (!location.hash && !!legacyParam && !$.isEmptyObject(legacyParam)) {
            location.replace( [ application.APPLICATION_START_SIGN, encodeURIComponent(JSON.stringify($.extend(application.getDefaultHashbang(), {
                action : application.convertLegacyToRyvussQuery($.extend(legacyParam, {
                    CarType : 'Y'
                }))
            }))) ].join(''));
        }

        Sammy('#_sammy_', function() {
            this.get(application.APPLICATION_START_SIGN.concat(':intent?'), function(context) {
                var hb = $.extend(application.getDefaultHashbang(), JSON.parse(context.params.intent || '{}'))

                if (firstUpdate) {
                    firstUpdate = false;

                    if (application.forXP === true) {
                        application.updateModel(hb).done(function() {
                            application.updateSearchResultsAll(hb).done(function() {
                                binder();
                            });
                        });
                    } else {
                        application.updateModel(hb).done(function() {
                            binder();
                        });
                    }
                } else {
                    application.updateModel(hb);
                }
                window.enlogInitJson.dataTalkView.param.filter = hb.action;
                window.enlogInitJson.dataTalkView.param.sortType = hb.sort;
            });

            this.get('#top', function() {
                application.route(function(hb) {
                    $(window).scrollTop(0);
                }, true);
            });
        }).run(application.APPLICATION_START_SIGN);
    });
});