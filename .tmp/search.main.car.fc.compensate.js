define( [ 'jquery', 'utils', '�˻�_����_���������_�߻�' ], function($, Utils, S) {
	var Class = function() {
		S.apply(this, arguments);
	};

	Class.prototype = $.extend(true, {}, S.prototype, {
		constructor : Class,
		/** @override */
		options : {
			/** @override */
			requestRyvussDefaultQuery : '(And.Hidden.N._.CarType.N._.Service.Compensate.)',
			/** @override */
			requestRyvussInavEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussPhotoResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussSpecialResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussNormalResultsEndpoint : '/search/car/list/premium',
			/** @override */
			requestRyvussWarrantResultsEndpoint : '/search/car/list/premium'
		}
	});

	return Class;
});